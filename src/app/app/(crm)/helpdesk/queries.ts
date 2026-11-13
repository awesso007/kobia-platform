import { withAuditedHistoricalServerRead } from "@/lib/chess/historical-server-read-round58";
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

async function listTicketsOriginal(filters: TicketFilters = {}) {
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

async function getTicketOriginal(id: string) {
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

async function dashboardStatsOriginal() {
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

async function listTeamsOriginal() {
  const { db } = getTenantDb();
  return db.team.findMany({ orderBy: { name: "asc" } });
}

async function listCategoriesOriginal() {
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

async function listSlaPoliciesOriginal() {
  const { db } = getTenantDb();
  return db.slaPolicy.findMany({ orderBy: { name: "asc" } });
}

async function listKbArticlesOriginal() {
  const { db } = getTenantDb();
  return db.kbArticle.findMany({
    orderBy: { updatedAt: "desc" },
    include: { category: { select: { id: true, name: true } } },
  });
}

async function getKbArticleOriginal(id: string) {
  const { db } = getTenantDb();
  return db.kbArticle.findUnique({ where: { id }, include: { category: true } });
}

async function listKbCategoriesOriginal() {
  const { db } = getTenantDb();
  return db.kbCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
}

export const listTickets = withAuditedHistoricalServerRead("helpdesk.listTickets", listTicketsOriginal);

export const getTicket = withAuditedHistoricalServerRead("helpdesk.getTicket", getTicketOriginal);

export const dashboardStats = withAuditedHistoricalServerRead("helpdesk.dashboardStats", dashboardStatsOriginal);

export const listTeams = withAuditedHistoricalServerRead("helpdesk.listTeams", listTeamsOriginal);

export const listCategories = withAuditedHistoricalServerRead("helpdesk.listCategories", listCategoriesOriginal);

export const listSlaPolicies = withAuditedHistoricalServerRead("helpdesk.listSlaPolicies", listSlaPoliciesOriginal);

export const listKbArticles = withAuditedHistoricalServerRead("helpdesk.listKbArticles", listKbArticlesOriginal);

export const getKbArticle = withAuditedHistoricalServerRead("helpdesk.getKbArticle", getKbArticleOriginal);

export const listKbCategories = withAuditedHistoricalServerRead("helpdesk.listKbCategories", listKbCategoriesOriginal);
