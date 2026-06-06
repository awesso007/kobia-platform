/*
 * Lead list query helpers (server-only). Reads through getTenantDb(). Kept out
 * of actions.ts because these are plain reads invoked from the server page, not
 * form actions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getTagMapForEntities } from "@/lib/crm/tags";
import type { TagRow } from "@/lib/crm/record";

export const LEADS_PAGE_SIZE = 25;

const SORTABLE = new Set(["name", "source", "status", "ownerUserId", "createdAt"]);

export type LeadListParams = {
  status?: string;
  source?: string;
  owner?: string;
  search?: string;
  sort?: string;
  dir?: string;
  page?: number;
};

export type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  source: string;
  status: string;
  ownerUserId: string | null;
  notes: string | null;
  createdAt: string;
  tags: TagRow[];
};

export async function listLeads(params: LeadListParams): Promise<{
  rows: LeadRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
}> {
  const { db } = getTenantDb();
  const page = Math.max(1, params.page ?? 1);

  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.source) where.source = params.source;
  if (params.owner) where.ownerUserId = params.owner;
  if (params.search) {
    const q = params.search.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
      ];
    }
  }

  const sortField = SORTABLE.has(params.sort ?? "") ? params.sort! : "createdAt";
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const [total, leads, ownerRows] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (page - 1) * LEADS_PAGE_SIZE,
      take: LEADS_PAGE_SIZE,
    }),
    db.lead.findMany({
      where: { ownerUserId: { not: null } },
      distinct: ["ownerUserId"],
      select: { ownerUserId: true },
    }),
  ]);

  const tagMap = await getTagMapForEntities("LEAD", leads.map((l) => l.id));

  return {
    rows: leads.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      companyName: l.companyName,
      source: l.source,
      status: l.status,
      ownerUserId: l.ownerUserId,
      notes: l.notes,
      createdAt: l.createdAt.toISOString(),
      tags: tagMap[l.id] ?? [],
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
    owners: ownerRows.map((o) => o.ownerUserId).filter((o): o is string => Boolean(o)),
  };
}
