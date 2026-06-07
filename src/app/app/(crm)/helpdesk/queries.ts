/*
 * Helpdesk read queries (Sprint 15, server-only). All reads go through
 * getTenantDb(). Listing + detail helpers for tickets, the dashboard, teams,
 * categories, SLA policies, and the knowledge base admin views.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";

export type TicketFilters = {
  status?: string;
  priority?: string;
  assigneeId?: string;
  teamId?: string;
  q?: string;
};

export async function listTickets(filters: TicketFilters = {}) {
  const { db } = getTenantDb();
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.assigneeId) where.assigneeId = filters.assigneeId;
  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.q) {
    where.OR = [
      { subject: { contains: filters.q, mode: "insensitive" } },
      { requesterEmail: { contains: filters.q, mode: "insensitive" } },
      { requesterName: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  return db.ticket.findMany({
    where: where as never,
    orderBy: [{ createdAt: "desc" }],
    include: {
      team: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, color: true } },
    },
    take: 200,
  });
}

export async function getTicket(id: string) {
  const { db } = getTenantDb();
  return db.ticket.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      slaPolicy: { select: { id: true, name: true } },
      requesterContact: { select: { id: true, firstName: true, lastName: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
      auditEvents: { orderBy: { createdAt: "asc" } },
      watchers: true,
    },
  });
}

export async function dashboardStats() {
  const { db } = getTenantDb();
  const [byStatus, byPriority, total, unassigned] = await Promise.all([
    db.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
    db.ticket.groupBy({ by: ["priority"], _count: { _all: true } }),
    db.ticket.count(),
    db.ticket.count({ where: { assigneeId: null, status: { in: ["NEW", "OPEN", "PENDING"] as never } } }),
  ]);
  const now = new Date();
  const breaching = await db.ticket.count({
    where: {
      status: { in: ["NEW", "OPEN", "PENDING"] as never },
      OR: [
        { firstResponseAt: null, firstResponseDueAt: { lt: now } },
        { resolvedAt: null, resolveDueAt: { lt: now } },
      ],
    },
  });
  const recent = await db.ticket.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true },
  });
  return {
    total,
    unassigned,
    breaching,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])),
    recent,
  };
}

export async function listTeams() {
  const { db } = getTenantDb();
  return db.team.findMany({ orderBy: { name: "asc" } });
}

export async function listCategories() {
  const { db } = getTenantDb();
  const [categories, policies] = await Promise.all([
    db.ticketCategory.findMany({ orderBy: { name: "asc" } }),
    db.slaPolicy.findMany({ select: { id: true, name: true } }),
  ]);
  const policyById = new Map(policies.map((p) => [p.id, p]));
  return categories.map((c) => ({
    ...c,
    slaPolicy: c.slaPolicyId ? policyById.get(c.slaPolicyId) ?? null : null,
  }));
}

export async function listSlaPolicies() {
  const { db } = getTenantDb();
  return db.slaPolicy.findMany({ orderBy: { name: "asc" } });
}

export async function listKbArticles() {
  const { db } = getTenantDb();
  return db.kbArticle.findMany({
    orderBy: { updatedAt: "desc" },
    include: { category: { select: { id: true, name: true } } },
  });
}

export async function getKbArticle(id: string) {
  const { db } = getTenantDb();
  return db.kbArticle.findUnique({ where: { id }, include: { category: true } });
}

export async function listKbCategories() {
  const { db } = getTenantDb();
  return db.kbCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
}
