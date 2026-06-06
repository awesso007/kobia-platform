/*
 * Activity list + calendar query helpers (server-only). Reads through
 * getTenantDb(). CrmActivity stores a nullable FK per related record type
 * (leadId / dealId / contactId / companyId); we surface the related record as a
 * {type,id,label} link so the list and calendar can deep-link into a RecordPane.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { ACTIVITY_TYPES, type ActivityKind, type RecordType } from "@/lib/crm/record";

export const ACTIVITIES_PAGE_SIZE = 25;

const SORTABLE = new Set(["dueAt", "occurredAt", "subject", "type", "createdAt"]);

export type RelatedRef = { type: RecordType; id: string; label: string } | null;

export type ActivityListRow = {
  id: string;
  type: ActivityKind;
  subject: string;
  body: string | null;
  occurredAt: string;
  dueAt: string | null;
  completedAt: string | null;
  ownerClerkUserId: string | null;
  related: RelatedRef;
};

export type ActivityStatusFilter = "open" | "done" | "overdue";

export type ActivityListParams = {
  type?: string;
  owner?: string;
  status?: string;
  relatedType?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  page?: number;
};

function relatedFrom(a: {
  leadId: string | null;
  dealId: string | null;
  contactId: string | null;
  companyId: string | null;
  lead?: { name: string } | null;
  deal?: { name: string } | null;
  contact?: { firstName: string; lastName: string | null } | null;
  company?: { name: string } | null;
}): RelatedRef {
  if (a.leadId) return { type: "lead", id: a.leadId, label: a.lead?.name ?? "Lead" };
  if (a.dealId) return { type: "deal", id: a.dealId, label: a.deal?.name ?? "Deal" };
  if (a.contactId)
    return {
      type: "contact",
      id: a.contactId,
      label: a.contact ? [a.contact.firstName, a.contact.lastName].filter(Boolean).join(" ") : "Contact",
    };
  if (a.companyId) return { type: "company", id: a.companyId, label: a.company?.name ?? "Company" };
  return null;
}

const RELATED_INCLUDE = {
  lead: { select: { name: true } },
  deal: { select: { name: true } },
  contact: { select: { firstName: true, lastName: true } },
  company: { select: { name: true } },
} as const;

function buildWhere(params: ActivityListParams): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (params.type && ACTIVITY_TYPES.includes(params.type as ActivityKind)) where.type = params.type;
  if (params.owner) where.ownerClerkUserId = params.owner;

  const now = new Date();
  if (params.status === "done") {
    where.completedAt = { not: null };
  } else if (params.status === "open") {
    where.completedAt = null;
  } else if (params.status === "overdue") {
    where.completedAt = null;
    where.dueAt = { lt: now };
  }

  if (params.relatedType === "lead") where.leadId = { not: null };
  else if (params.relatedType === "deal") where.dealId = { not: null };
  else if (params.relatedType === "contact") where.contactId = { not: null };
  else if (params.relatedType === "company") where.companyId = { not: null };

  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.gte = new Date(params.from);
    if (params.to) {
      const end = new Date(params.to);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.dueAt = { ...(where.dueAt as object | undefined), ...range };
  }
  return where;
}

export async function listActivities(params: ActivityListParams): Promise<{
  rows: ActivityListRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
}> {
  const { db } = getTenantDb();
  const page = Math.max(1, params.page ?? 1);
  const where = buildWhere(params);

  const sortField = SORTABLE.has(params.sort ?? "") ? params.sort! : "dueAt";
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const [total, rows, ownerRows] = await Promise.all([
    db.crmActivity.count({ where }),
    db.crmActivity.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (page - 1) * ACTIVITIES_PAGE_SIZE,
      take: ACTIVITIES_PAGE_SIZE,
      include: RELATED_INCLUDE,
    }),
    db.crmActivity.findMany({
      where: { ownerClerkUserId: { not: null } },
      distinct: ["ownerClerkUserId"],
      select: { ownerClerkUserId: true },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type as ActivityKind,
      subject: r.subject,
      body: r.body,
      occurredAt: r.occurredAt.toISOString(),
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      ownerClerkUserId: r.ownerClerkUserId,
      related: relatedFrom(r),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ACTIVITIES_PAGE_SIZE)),
    owners: ownerRows.map((o) => o.ownerClerkUserId).filter((o): o is string => Boolean(o)),
  };
}

/** Activities with a dueAt inside the given month (UTC), for the calendar view. */
export async function listActivitiesForMonth(
  year: number,
  month: number,
  params: Pick<ActivityListParams, "type" | "owner" | "status" | "relatedType">,
): Promise<ActivityListRow[]> {
  const { db } = getTenantDb();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const base = buildWhere(params);
  const where = { ...base, dueAt: { ...(base.dueAt as object | undefined), gte: start, lte: end } };

  const rows = await db.crmActivity.findMany({
    where,
    orderBy: { dueAt: "asc" },
    take: 1000,
    include: RELATED_INCLUDE,
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type as ActivityKind,
    subject: r.subject,
    body: r.body,
    occurredAt: r.occurredAt.toISOString(),
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    ownerClerkUserId: r.ownerClerkUserId,
    related: relatedFrom(r),
  }));
}

/** Lightweight option lists for the create-activity related-record picker. */
export async function listRelatedOptions(): Promise<{
  lead: { id: string; label: string }[];
  deal: { id: string; label: string }[];
  contact: { id: string; label: string }[];
  company: { id: string; label: string }[];
}> {
  const { db } = getTenantDb();
  const [leads, deals, contacts, companies] = await Promise.all([
    db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true } }),
    db.deal.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, name: true } }),
    db.contact.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, firstName: true, lastName: true } }),
    db.company.findMany({ orderBy: { name: "asc" }, take: 200, select: { id: true, name: true } }),
  ]);
  return {
    lead: leads.map((l) => ({ id: l.id, label: l.name })),
    deal: deals.map((d) => ({ id: d.id, label: d.name })),
    contact: contacts.map((c) => ({ id: c.id, label: [c.firstName, c.lastName].filter(Boolean).join(" ") })),
    company: companies.map((c) => ({ id: c.id, label: c.name })),
  };
}
