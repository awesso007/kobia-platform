"use server";

/*
 * Helpdesk server actions (Sprint 15). All DB access goes through getTenantDb().
 * Each mutating action enforces requirePermission. Tickets and KB articles are
 * not CRM-audited entities (auditWrite only covers LEAD/DEAL/CONTACT/COMPANY) so
 * auditWrite is skipped by design, mirroring the Marketing and Documents
 * modules. Tickets carry their own TicketAuditEvent trail written in the lib.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { reindex, removeFromIndex } from "@/lib/search";
import {
  createTicket as createTicketLib,
  addMessage,
  changeStatus,
  changePriority,
  assignTicket,
  addWatcher as addWatcherLib,
  removeWatcher as removeWatcherLib,
  type Priority,
  type TicketStatus,
} from "@/lib/helpdesk/tickets";
import { upsertArticle } from "@/lib/helpdesk/kb";

// ------------------------------------------------------------- Tickets

export async function createTicket(input: {
  subject: string;
  description: string;
  priority?: Priority;
  requesterEmail: string;
  requesterName: string;
  teamId?: string | null;
  categoryId?: string | null;
  slaPolicyId?: string | null;
  assigneeId?: string | null;
}): Promise<string> {
  await requirePermission("record:create");
  const subject = input.subject?.trim();
  const requesterEmail = input.requesterEmail?.trim();
  if (!subject) throw new Error("Subject is required.");
  if (!requesterEmail) throw new Error("Requester email is required.");
  const { db } = getTenantDb();
  const id = await createTicketLib(db, {
    subject,
    description: input.description ?? "",
    priority: input.priority,
    requesterEmail,
    requesterName: input.requesterName?.trim() || requesterEmail,
    teamId: input.teamId || null,
    categoryId: input.categoryId || null,
    slaPolicyId: input.slaPolicyId || null,
    assigneeId: input.assigneeId || null,
    channel: "MANUAL",
    actorType: "AGENT",
  });
  revalidatePath("/app/helpdesk/tickets");
  return id;
}

export async function replyToTicket(input: {
  ticketId: string;
  bodyHtml: string;
  isInternal?: boolean;
  authorName?: string;
}): Promise<void> {
  await requirePermission("record:update");
  const body = input.bodyHtml?.trim();
  if (!body) throw new Error("Reply body is required.");
  const { db } = getTenantDb();
  await addMessage(db, {
    ticketId: input.ticketId,
    authorType: "AGENT",
    authorName: input.authorName?.trim() || "Agent",
    bodyHtml: body,
    isInternal: input.isInternal ?? false,
  });
  revalidatePath(`/app/helpdesk/tickets/${input.ticketId}`);
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await changeStatus(db, ticketId, status, { actorType: "AGENT" });
  revalidatePath(`/app/helpdesk/tickets/${ticketId}`);
}

export async function setTicketPriority(ticketId: string, priority: Priority): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await changePriority(db, ticketId, priority, { actorType: "AGENT" });
  revalidatePath(`/app/helpdesk/tickets/${ticketId}`);
}

export async function setTicketAssignment(
  ticketId: string,
  input: { assigneeId?: string | null; teamId?: string | null },
): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await assignTicket(db, ticketId, {
    assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId || null,
    teamId: input.teamId === undefined ? undefined : input.teamId || null,
  });
  revalidatePath(`/app/helpdesk/tickets/${ticketId}`);
}

export async function addTicketWatcher(ticketId: string, userId: string): Promise<void> {
  await requirePermission("record:update");
  if (!userId.trim()) throw new Error("User is required.");
  const { db } = getTenantDb();
  await addWatcherLib(db, ticketId, userId.trim());
  revalidatePath(`/app/helpdesk/tickets/${ticketId}`);
}

export async function removeTicketWatcher(ticketId: string, userId: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await removeWatcherLib(db, ticketId, userId);
  revalidatePath(`/app/helpdesk/tickets/${ticketId}`);
}

// ------------------------------------------------------------- Teams

export async function createTeam(input: { name: string; description?: string | null }): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Team name is required.");
  const { db } = getTenantDb();
  const team = await db.team.create({
    data: { name, description: input.description?.trim() || null, memberIdsJson: [] },
  });
  revalidatePath("/app/helpdesk/teams");
  return team.id;
}

export async function deleteTeam(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.team.delete({ where: { id } });
  revalidatePath("/app/helpdesk/teams");
}

// ------------------------------------------------------------- Categories

export async function createCategory(input: {
  name: string;
  description?: string | null;
  slaPolicyId?: string | null;
  color?: string | null;
}): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Category name is required.");
  const { db } = getTenantDb();
  const cat = await db.ticketCategory.create({
    data: {
      name,
      description: input.description?.trim() || null,
      slaPolicyId: input.slaPolicyId || null,
      color: input.color?.trim() || null,
    },
  });
  revalidatePath("/app/helpdesk/categories");
  return cat.id;
}

export async function deleteCategory(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.ticketCategory.delete({ where: { id } });
  revalidatePath("/app/helpdesk/categories");
}

// ------------------------------------------------------------- SLA policies

export async function createSlaPolicy(input: {
  name: string;
  description?: string | null;
  firstResponseMinutes: number;
  resolveMinutes: number;
  businessHoursOnly?: boolean;
}): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Policy name is required.");
  const { db } = getTenantDb();
  const policy = await db.slaPolicy.create({
    data: {
      name,
      description: input.description?.trim() || null,
      firstResponseMinutes: Math.max(1, Math.round(input.firstResponseMinutes)),
      resolveMinutes: Math.max(1, Math.round(input.resolveMinutes)),
      businessHoursOnly: input.businessHoursOnly ?? false,
    },
  });
  revalidatePath("/app/helpdesk/sla");
  return policy.id;
}

export async function deleteSlaPolicy(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.slaPolicy.delete({ where: { id } });
  revalidatePath("/app/helpdesk/sla");
}

// ------------------------------------------------------------- Knowledge base

export async function saveKbArticle(input: {
  id?: string;
  title: string;
  bodyHtml: string;
  summary?: string | null;
  categoryId?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  visibility?: "PUBLIC" | "INTERNAL" | "AUTHENTICATED";
}): Promise<string> {
  await requirePermission(input.id ? "record:update" : "record:create");
  const title = input.title?.trim();
  if (!title) throw new Error("Title is required.");
  const { db } = getTenantDb();
  const id = await upsertArticle(db, {
    id: input.id,
    title,
    bodyHtml: input.bodyHtml ?? "",
    summary: input.summary?.trim() || null,
    categoryId: input.categoryId || null,
    status: input.status,
    visibility: input.visibility,
  });
  revalidatePath("/app/helpdesk/kb");
  return id;
}

export async function deleteKbArticle(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.kbArticle.delete({ where: { id } });
  await removeFromIndex(db, "KB_ARTICLE", id).catch(() => undefined);
  revalidatePath("/app/helpdesk/kb");
}

export async function createKbCategory(input: { name: string; description?: string | null }): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Category name is required.");
  const { db } = getTenantDb();
  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "category";
  let slug = slugBase;
  for (let i = 2; i < 100; i++) {
    const exists = await db.kbCategory.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${slugBase}-${i}`;
  }
  const cat = await db.kbCategory.create({
    data: { name, slug, description: input.description?.trim() || null },
  });
  revalidatePath("/app/helpdesk/kb/categories");
  return cat.id;
}

export async function deleteKbCategory(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.kbCategory.delete({ where: { id } });
  revalidatePath("/app/helpdesk/kb/categories");
}
