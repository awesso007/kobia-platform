/*
 * Company list + detail query helpers (server-only). Reads through
 * getTenantDb(). The list view is sortable/paginated/filterable; the detail
 * loader pulls related contacts and deals for the RecordPane Details tab.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getTagMapForEntities } from "@/lib/crm/tags";
import type { TagRow } from "@/lib/crm/record";

export const COMPANIES_PAGE_SIZE = 25;

const SORTABLE = new Set(["name", "domain", "industry", "size", "ownerUserId", "createdAt"]);

export type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  ownerUserId: string | null;
  createdAt: string;
  tags: TagRow[];
};

export type CompanyListParams = {
  industry?: string;
  owner?: string;
  tag?: string;
  search?: string;
  sort?: string;
  dir?: string;
  page?: number;
};

export async function listCompanies(params: CompanyListParams): Promise<{
  rows: CompanyRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
  industries: string[];
}> {
  const { db } = getTenantDb();
  const page = Math.max(1, params.page ?? 1);

  const where: Record<string, unknown> = {};
  if (params.industry) where.industry = params.industry;
  if (params.owner) where.ownerUserId = params.owner;
  if (params.search) {
    const q = params.search.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { domain: { contains: q, mode: "insensitive" } },
        { website: { contains: q, mode: "insensitive" } },
      ];
    }
  }
  if (params.tag) {
    const assigned = await db.tagAssignment.findMany({
      where: { entityType: "COMPANY", tagId: params.tag },
      select: { entityId: true },
    });
    where.id = { in: assigned.map((a) => a.entityId) };
  }

  const sortField = SORTABLE.has(params.sort ?? "") ? params.sort! : "createdAt";
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const [total, companies, ownerRows, industryRows] = await Promise.all([
    db.company.count({ where }),
    db.company.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (page - 1) * COMPANIES_PAGE_SIZE,
      take: COMPANIES_PAGE_SIZE,
    }),
    db.company.findMany({ where: { ownerUserId: { not: null } }, distinct: ["ownerUserId"], select: { ownerUserId: true } }),
    db.company.findMany({ where: { industry: { not: null } }, distinct: ["industry"], select: { industry: true } }),
  ]);

  const tagMap = await getTagMapForEntities("COMPANY", companies.map((c) => c.id));

  return {
    rows: companies.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      size: c.size,
      website: c.website,
      phone: c.phone,
      address: c.address,
      ownerUserId: c.ownerUserId,
      createdAt: c.createdAt.toISOString(),
      tags: tagMap[c.id] ?? [],
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / COMPANIES_PAGE_SIZE)),
    owners: ownerRows.map((o) => o.ownerUserId).filter((o): o is string => Boolean(o)),
    industries: industryRows.map((i) => i.industry).filter((i): i is string => Boolean(i)),
  };
}

export type RelatedContact = { id: string; name: string; email: string | null; title: string | null };
export type RelatedDeal = { id: string; name: string; amountCents: number; status: string };

export async function getCompanyRelations(companyId: string): Promise<{
  contacts: RelatedContact[];
  deals: RelatedDeal[];
}> {
  const { db } = getTenantDb();
  const [contacts, deals] = await Promise.all([
    db.contact.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.deal.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  return {
    contacts: contacts.map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      email: c.email,
      title: c.title,
    })),
    deals: deals.map((d) => ({
      id: d.id,
      name: d.name,
      amountCents: Number(d.amountCents),
      status: d.status,
    })),
  };
}

/** Lightweight company options for typeahead (id + name + domain). */
export async function listCompanyOptions(): Promise<{ id: string; name: string; domain: string | null }[]> {
  const { db } = getTenantDb();
  const rows = await db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, domain: true }, take: 500 });
  return rows;
}
