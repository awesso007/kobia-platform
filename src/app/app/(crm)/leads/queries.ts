/**
 * R55: Legacy leads have no businessId. Never release legacy CRM PII in a
 * multi-unit CHESS tenant. Directory, owner facets and tag relationships
 * are selected in the same audited SERIALIZABLE transaction.
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withAuditedLegacyLeadRead, legacyOwnerFilter } from "@/lib/chess/legacy-lead-security-round54";
import type { Prisma } from "@/lib/db/generated/tenant";
import type { TagRow } from "@/lib/crm/record";

export const LEADS_PAGE_SIZE = 25;
const SORTABLE = new Set(["name", "source", "status", "ownerUserId", "createdAt"]);
export type LeadListParams = {
  status?: string; source?: string; owner?: string; search?: string;
  sort?: string; dir?: string; page?: number;
};
export type LeadRow = {
  id: string; name: string; email: string | null; phone: string | null;
  companyName: string | null; source: string; status: string;
  ownerUserId: string | null; notes: string | null; createdAt: string; tags: TagRow[];
};
export async function listLeads(params: LeadListParams): Promise<{
  rows: LeadRow[]; total: number; page: number; pageCount: number; owners: string[];
}> {
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:read");
  const { db } = getTenantDb();
  const requested = Number.isSafeInteger(params.page) ? params.page! : 1;
  const page = Math.max(1, Math.min(1000, requested));
  return withAuditedLegacyLeadRead(db, member.clerkUserId, "LEGACY_LEAD_DIRECTORY_READ",
    "PAGE:" + page, async (tx, actor) => {
      const and: Prisma.LeadWhereInput[] = [legacyOwnerFilter(actor)];
      if (params.status) and.push({ status: params.status as Prisma.LeadWhereInput["status"] });
      if (params.source) and.push({ source: params.source as Prisma.LeadWhereInput["source"] });
      if (params.owner) and.push({ ownerUserId: params.owner });
      if (params.search?.trim()) {
        const q = params.search.trim().slice(0, 120);
        and.push({ OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
        ] });
      }
      const where: Prisma.LeadWhereInput = { AND: and };
      const sortField = SORTABLE.has(params.sort ?? "") ? params.sort! : "createdAt";
      const sortDir = params.dir === "asc" ? "asc" : "desc";
      const [total, leads, ownerRows] = await Promise.all([
        tx.lead.count({ where }),
        tx.lead.findMany({
          where, orderBy: { [sortField]: sortDir },
          skip: (page - 1) * LEADS_PAGE_SIZE, take: LEADS_PAGE_SIZE,
        }),
        tx.lead.findMany({
          where: { AND: [legacyOwnerFilter(actor), { ownerUserId: { not: null } }] },
          distinct: ["ownerUserId"], select: { ownerUserId: true }, take: 100,
        }),
      ]);
      const tagRows = leads.length ? await tx.tagAssignment.findMany({
        where: { entityType: "LEAD", entityId: { in: leads.map(l => l.id) } },
        include: { tag: true },
      }) : [];
      const tags: Record<string, TagRow[]> = {};
      for (const t of tagRows)
        (tags[t.entityId] ??= []).push({ id: t.tag.id, name: t.tag.name, color: t.tag.color });
      return {
        rows: leads.map(l => ({
          id: l.id, name: l.name, email: l.email, phone: l.phone,
          companyName: l.companyName, source: l.source, status: l.status,
          ownerUserId: l.ownerUserId, notes: l.notes,
          createdAt: l.createdAt.toISOString(), tags: tags[l.id] ?? [],
        })),
        total, page, pageCount: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
        owners: ownerRows.map(o => o.ownerUserId).filter((id): id is string => !!id),
      };
    });
}
