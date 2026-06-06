/*
 * Contact list + detail query helpers (server-only). Reads through
 * getTenantDb(). List view is sortable/paginated/filterable; the detail loader
 * pulls the linked company and the contact's deals for the RecordPane.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getTagMapForEntities } from "@/lib/crm/tags";
import type { TagRow } from "@/lib/crm/record";

export const CONTACTS_PAGE_SIZE = 25;

const SORTABLE = new Set(["firstName", "lastName", "email", "createdAt"]);

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  ownerUserId: string | null;
  createdAt: string;
  tags: TagRow[];
};

export type ContactListParams = {
  company?: string;
  owner?: string;
  tag?: string;
  search?: string;
  sort?: string;
  dir?: string;
  page?: number;
};

export async function listContacts(params: ContactListParams): Promise<{
  rows: ContactRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
  companies: { id: string; name: string }[];
}> {
  const { db } = getTenantDb();
  const page = Math.max(1, params.page ?? 1);

  const where: Record<string, unknown> = {};
  if (params.company) where.companyId = params.company;
  if (params.owner) where.ownerUserId = params.owner;
  if (params.search) {
    const q = params.search.trim();
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
  }
  if (params.tag) {
    const assigned = await db.tagAssignment.findMany({
      where: { entityType: "CONTACT", tagId: params.tag },
      select: { entityId: true },
    });
    where.id = { in: assigned.map((a) => a.entityId) };
  }

  const sortField = SORTABLE.has(params.sort ?? "") ? params.sort! : "createdAt";
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const [total, contacts, ownerRows, companyRows] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (page - 1) * CONTACTS_PAGE_SIZE,
      take: CONTACTS_PAGE_SIZE,
      include: { company: { select: { name: true } } },
    }),
    db.contact.findMany({ where: { ownerUserId: { not: null } }, distinct: ["ownerUserId"], select: { ownerUserId: true } }),
    db.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true }, take: 500 }),
  ]);

  const tagMap = await getTagMapForEntities("CONTACT", contacts.map((c) => c.id));

  return {
    rows: contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      email: c.email,
      phone: c.phone,
      title: c.title,
      companyId: c.companyId,
      companyName: c.company?.name ?? null,
      ownerUserId: c.ownerUserId,
      createdAt: c.createdAt.toISOString(),
      tags: tagMap[c.id] ?? [],
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)),
    owners: ownerRows.map((o) => o.ownerUserId).filter((o): o is string => Boolean(o)),
    companies: companyRows,
  };
}

export type LinkedCompany = { id: string; name: string; domain: string | null; industry: string | null };
export type LinkedDeal = { id: string; name: string; amountCents: number; status: string };

export async function getContactRelations(contactId: string): Promise<{
  company: LinkedCompany | null;
  deals: LinkedDeal[];
}> {
  const { db } = getTenantDb();
  const contact = await db.contact.findUnique({ where: { id: contactId }, include: { company: true } });
  const deals = await db.deal.findMany({ where: { contactId }, orderBy: { updatedAt: "desc" }, take: 50 });
  return {
    company: contact?.company
      ? { id: contact.company.id, name: contact.company.name, domain: contact.company.domain, industry: contact.company.industry }
      : null,
    deals: deals.map((d) => ({ id: d.id, name: d.name, amountCents: Number(d.amountCents), status: d.status })),
  };
}
