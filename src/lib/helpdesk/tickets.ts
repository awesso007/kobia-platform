/*
 * Helpdesk ticket logic (Sprint 15). Server-side helpers for creating tickets,
 * posting replies/notes, changing status/priority/assignment, and managing
 * watchers. Every function takes an explicit db so it works inside a request
 * scope (getTenantDb) and outside one (getTenantPrisma by slug, used by the
 * public customer portal API and the SLA-breach cron).
 *
 * Ticket numbers come from the tenant-level Postgres sequence ticket_number_seq
 * (created in migration 0015). Prisma cannot model a sequence default cleanly,
 * so we pull nextval() via $queryRaw and pass it into the create.
 *
 * Every meaningful state change writes a TicketAuditEvent so the detail page can
 * show a trail, and reindexes the ticket for the command palette. Automation
 * dispatch (TICKET_CREATED / TICKET_STATUS_CHANGED) is best-effort and never
 * breaks the originating write.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { reindex } from "@/lib/search";
import { computeDueDates, type Priority, type SlaPolicyShape } from "./sla";
export type { Priority } from "./sla";

type Db = PrismaClient;

export type AuthorType = "AGENT" | "CUSTOMER" | "SYSTEM";
export type TicketStatus = "NEW" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type AuditEvent =
  | "CREATED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "ASSIGNED"
  | "REPLIED"
  | "INTERNAL_NOTE"
  | "MERGED"
  | "CLOSED"
  | "REOPENED"
  | "SLA_BREACHED";

/** Allocate the next ticket number from the tenant sequence. */
export async function nextTicketNumber(db: Db): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT nextval('ticket_number_seq') AS n`,
  );
  const n = rows[0]?.n;
  return typeof n === "bigint" ? Number(n) : Number(n ?? 0);
}

async function logAudit(
  db: Db,
  ticketId: string,
  event: AuditEvent,
  opts: {
    actorType?: AuthorType;
    actorId?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    metadata?: Record<string, unknown> | null;
  } = {},
): Promise<void> {
  await db.ticketAuditEvent.create({
    data: {
      ticketId,
      actorType: (opts.actorType ?? "SYSTEM") as never,
      actorId: opts.actorId ?? null,
      event: event as never,
      oldValue: opts.oldValue ?? null,
      newValue: opts.newValue ?? null,
      metadataJson: (opts.metadata ?? undefined) as never,
    },
  });
}

async function dispatch(
  db: Db,
  type: "TICKET_CREATED" | "TICKET_STATUS_CHANGED" | "SLA_BREACHED",
  ticketId: string,
  changedFields?: string[],
): Promise<void> {
  try {
    const { dispatchAutomation } = await import("@/lib/automations/dispatch");
    await dispatchAutomation({ type, entityType: "TICKET", entityId: ticketId, changedFields }, db);
  } catch (err) {
    console.error(`[helpdesk] dispatch ${type} failed for ${ticketId}`, err);
  }
}

export type CreateTicketInput = {
  subject: string;
  description: string;
  priority?: Priority;
  channel?: "EMAIL" | "PORTAL" | "PHONE" | "CHAT" | "MANUAL";
  requesterEmail: string;
  requesterName: string;
  requesterContactId?: string | null;
  assigneeId?: string | null;
  teamId?: string | null;
  categoryId?: string | null;
  slaPolicyId?: string | null;
  tags?: string[];
  actorType?: AuthorType;
  actorId?: string | null;
};

/**
 * Create a ticket. Resolves the SLA policy (explicit, or the category's, or
 * none), computes due dates, allocates a sequence number, writes a CREATED
 * audit event, reindexes for search, and dispatches TICKET_CREATED.
 */
export async function createTicket(db: Db, input: CreateTicketInput): Promise<string> {
  const priority: Priority = input.priority ?? "NORMAL";
  const number = await nextTicketNumber(db);

  let slaPolicyId = input.slaPolicyId ?? null;
  if (!slaPolicyId && input.categoryId) {
    const cat = await db.ticketCategory.findUnique({ where: { id: input.categoryId } });
    slaPolicyId = cat?.slaPolicyId ?? null;
  }

  let firstResponseDueAt: Date | null = null;
  let resolveDueAt: Date | null = null;
  if (slaPolicyId) {
    const policy = await db.slaPolicy.findUnique({ where: { id: slaPolicyId } });
    if (policy) {
      const due = computeDueDates(policy as SlaPolicyShape, priority, new Date());
      firstResponseDueAt = due.firstResponseDueAt;
      resolveDueAt = due.resolveDueAt;
    }
  }

  const ticket = await db.ticket.create({
    data: {
      number,
      subject: input.subject,
      description: input.description,
      priority: priority as never,
      channel: (input.channel ?? "MANUAL") as never,
      status: "NEW" as never,
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      requesterContactId: input.requesterContactId ?? null,
      assigneeId: input.assigneeId ?? null,
      teamId: input.teamId ?? null,
      categoryId: input.categoryId ?? null,
      slaPolicyId,
      firstResponseDueAt,
      resolveDueAt,
      tags: input.tags ?? [],
    },
  });

  await logAudit(db, ticket.id, "CREATED", {
    actorType: input.actorType ?? "AGENT",
    actorId: input.actorId ?? null,
  });
  await reindex(db, "TICKET", ticket.id);
  await dispatch(db, "TICKET_CREATED", ticket.id);
  return ticket.id;
}

export type ReplyInput = {
  ticketId: string;
  authorType: AuthorType;
  authorName: string;
  authorId?: string | null;
  authorEmail?: string | null;
  bodyHtml: string;
  isInternal?: boolean;
};

/**
 * Post a message on a ticket. A public reply (isInternal false) records first
 * response time if not already set, and moves a NEW ticket to OPEN (agent) or
 * PENDING handling. Writes a REPLIED or INTERNAL_NOTE audit event and reindexes.
 */
export async function addMessage(db: Db, input: ReplyInput): Promise<string | null> {
  const ticket = await db.ticket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) return null;

  const msg = await db.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      authorType: input.authorType as never,
      authorId: input.authorId ?? null,
      authorName: input.authorName,
      authorEmail: input.authorEmail ?? null,
      bodyHtml: input.bodyHtml,
      isInternal: input.isInternal ?? false,
    },
  });

  const data: Record<string, unknown> = {};
  if (!input.isInternal && input.authorType === "AGENT" && !ticket.firstResponseAt) {
    data.firstResponseAt = new Date();
  }
  if (!input.isInternal) {
    if (input.authorType === "AGENT" && (ticket.status === "NEW" || ticket.status === "OPEN")) {
      data.status = "PENDING";
    } else if (input.authorType === "CUSTOMER" && (ticket.status === "PENDING" || ticket.status === "RESOLVED")) {
      data.status = "OPEN";
    } else if (ticket.status === "NEW") {
      data.status = "OPEN";
    }
  }
  if (Object.keys(data).length > 0) {
    await db.ticket.update({ where: { id: ticket.id }, data: data as never });
  }

  await logAudit(db, ticket.id, input.isInternal ? "INTERNAL_NOTE" : "REPLIED", {
    actorType: input.authorType,
    actorId: input.authorId ?? null,
  });
  await reindex(db, "TICKET", ticket.id);
  return msg.id;
}

/** Change a ticket's status, stamping resolved/closed timestamps and auditing. */
export async function changeStatus(
  db: Db,
  ticketId: string,
  status: TicketStatus,
  opts: { actorType?: AuthorType; actorId?: string | null } = {},
): Promise<boolean> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return false;
  if (ticket.status === status) return true;

  const data: Record<string, unknown> = { status };
  if (status === "RESOLVED" && !ticket.resolvedAt) data.resolvedAt = new Date();
  if (status === "CLOSED" && !ticket.closedAt) data.closedAt = new Date();
  if ((status === "OPEN" || status === "NEW") && ticket.status === "RESOLVED") {
    data.resolvedAt = null;
  }
  await db.ticket.update({ where: { id: ticketId }, data: data as never });

  const reopened = (ticket.status === "RESOLVED" || ticket.status === "CLOSED") && (status === "OPEN" || status === "NEW");
  const event: AuditEvent = status === "CLOSED" ? "CLOSED" : reopened ? "REOPENED" : "STATUS_CHANGED";
  await logAudit(db, ticketId, event, {
    actorType: opts.actorType ?? "AGENT",
    actorId: opts.actorId ?? null,
    oldValue: ticket.status,
    newValue: status,
  });
  await reindex(db, "TICKET", ticketId);
  await dispatch(db, "TICKET_STATUS_CHANGED", ticketId, ["status"]);
  return true;
}

/** Change a ticket's priority, recomputing SLA due dates and auditing. */
export async function changePriority(
  db: Db,
  ticketId: string,
  priority: Priority,
  opts: { actorType?: AuthorType; actorId?: string | null } = {},
): Promise<boolean> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return false;
  if (ticket.priority === priority) return true;

  const data: Record<string, unknown> = { priority };
  if (ticket.slaPolicyId) {
    const policy = await db.slaPolicy.findUnique({ where: { id: ticket.slaPolicyId } });
    if (policy) {
      const due = computeDueDates(policy as SlaPolicyShape, priority, ticket.createdAt);
      data.firstResponseDueAt = due.firstResponseDueAt;
      data.resolveDueAt = due.resolveDueAt;
    }
  }
  await db.ticket.update({ where: { id: ticketId }, data: data as never });
  await logAudit(db, ticketId, "PRIORITY_CHANGED", {
    actorType: opts.actorType ?? "AGENT",
    actorId: opts.actorId ?? null,
    oldValue: ticket.priority,
    newValue: priority,
  });
  await reindex(db, "TICKET", ticketId);
  return true;
}

/** Assign (or unassign) a ticket to an agent and/or team, auditing the change. */
export async function assignTicket(
  db: Db,
  ticketId: string,
  input: { assigneeId?: string | null; teamId?: string | null },
  opts: { actorId?: string | null } = {},
): Promise<boolean> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return false;
  const data: Record<string, unknown> = {};
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
  if (input.teamId !== undefined) data.teamId = input.teamId;
  if (Object.keys(data).length === 0) return true;
  await db.ticket.update({ where: { id: ticketId }, data: data as never });
  await logAudit(db, ticketId, "ASSIGNED", {
    actorType: "AGENT",
    actorId: opts.actorId ?? null,
    oldValue: ticket.assigneeId ?? null,
    newValue: input.assigneeId ?? ticket.assigneeId ?? null,
  });
  await reindex(db, "TICKET", ticketId);
  return true;
}

/** Add a watcher (idempotent on the ticketId+userId unique). */
export async function addWatcher(db: Db, ticketId: string, userId: string): Promise<void> {
  await db.ticketWatcher.upsert({
    where: { ticketId_userId: { ticketId, userId } },
    create: { ticketId, userId },
    update: {},
  });
}

/** Remove a watcher. */
export async function removeWatcher(db: Db, ticketId: string, userId: string): Promise<void> {
  await db.ticketWatcher.deleteMany({ where: { ticketId, userId } });
}

/**
 * Scan for SLA breaches: open tickets whose firstResponseDueAt has passed with
 * no first response, or whose resolveDueAt has passed while still unresolved.
 * Logs an SLA_BREACHED audit event (once per kind) and dispatches SLA_BREACHED.
 * Returns the number of newly flagged breaches. Cron-safe (injected db).
 */
export async function scanSlaBreaches(db: Db): Promise<number> {
  const now = new Date();
  const open = await db.ticket.findMany({
    where: { status: { in: ["NEW", "OPEN", "PENDING"] as never } },
    take: 1000,
  });

  let flagged = 0;
  for (const t of open) {
    const breaches: string[] = [];
    if (t.firstResponseDueAt && !t.firstResponseAt && t.firstResponseDueAt < now) breaches.push("firstResponse");
    if (t.resolveDueAt && !t.resolvedAt && t.resolveDueAt < now) breaches.push("resolve");
    if (breaches.length === 0) continue;

    for (const kind of breaches) {
      const already = await db.ticketAuditEvent.findFirst({
        where: { ticketId: t.id, event: "SLA_BREACHED" as never, newValue: kind },
      });
      if (already) continue;
      await logAudit(db, t.id, "SLA_BREACHED", { actorType: "SYSTEM", newValue: kind });
      flagged++;
      await dispatch(db, "SLA_BREACHED", t.id, [kind]);
    }
  }
  return flagged;
}
