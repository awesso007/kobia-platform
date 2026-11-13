/**
 * Round 56: Contact listing, owner/company facets and company/deal relations
 * never disclose ungranted CHESS client profiles. This legacy source has no
 * businessId, so a >500-row tenant must migrate to partitioned records before
 * this bounded compatibility view can be used. All data and the security
 * receipt are selected in the same SERIALIZABLE transaction.
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";
import type { TagRow } from "@/lib/crm/record";

export const CONTACTS_PAGE_SIZE = 25;
const SORTABLE = new Set(["firstName", "lastName", "email", "createdAt"]);
export type ContactRow = {
  id: string; firstName: string; lastName: string | null; name: string;
  email: string | null; phone: string | null; title: string | null;
  companyId: string | null; companyName: string | null;
  ownerUserId: string | null; createdAt: string; tags: TagRow[];
};
export type ContactListParams = {
  company?: string; owner?: string; tag?: string; search?: string;
  sort?: string; dir?: string; page?: number;
};
export type LinkedCompany = { id: string; name: string; domain: string | null; industry: string | null };
export type LinkedDeal = { id: string; name: string; amountCents: number; status: string };

async function memberId() {
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:read");
  return member.clerkUserId;
}
export async function listContacts(params: ContactListParams): Promise<{
  rows: ContactRow[]; total: number; page: number; pageCount: number;
  owners: string[]; companies: { id: string; name: string }[];
}> {
  const user = await memberId();
  const { db } = getTenantDb();
  const page = Number.isSafeInteger(params.page) ? Math.min(100, Math.max(1, params.page!)) : 1;
  return withLegacyCrmTransaction(db, user, "record:read", "CONTACT", "LIST",
    "LEGACY_CONTACT_DIRECTORY_READ", async (tx, actor) => {
      // No aggregate count or secondary facet query can leak excluded client
      // data. The limited base set is filtered by the same grant predicate.
      const count = await tx.contact.count();
      if (count > 500) throw new PermissionError("record:read");
      const sort = SORTABLE.has(params.sort ?? "") ? params.sort! : "createdAt";
      const dir = params.dir === "asc" ? "asc" : "desc";
      const candidates = await tx.contact.findMany({
        orderBy: { [sort]: dir }, take: 501,
        include: { company: { select: { id: true, name: true } } },
      });
      const allowed: typeof candidates = [];
      for (const row of candidates) {
        try {
          await assertLegacyCrmRecord(tx, actor, "CONTACT", row.id, "record:read");
          allowed.push(row);
        } catch (e) { if (!(e instanceof PermissionError)) throw e; }
      }
      const owners = [...new Set(allowed.map(c => c.ownerUserId)
        .filter((o): o is string => !!o))];
      const companyMap = new Map(allowed.filter(c => c.company).map(c =>
        [c.company!.id, { id: c.company!.id, name: c.company!.name }] as const));
      const companyOptions = [...companyMap.values()].sort((a,b)=>a.name.localeCompare(b.name));
      let filtered = allowed.filter(c =>
        (!params.company || c.companyId === params.company) &&
        (!params.owner || c.ownerUserId === params.owner) &&
        (!params.search?.trim() || [c.firstName, c.lastName, c.email]
          .some(value => value?.toLowerCase().includes(params.search!.trim().toLowerCase().slice(0,120)))));
      if (params.tag) {
        const assigned = await tx.tagAssignment.findMany({
          where: { entityType: "CONTACT", tagId: params.tag,
            entityId: { in: filtered.map(c=>c.id) } }, select: { entityId: true },
        });
        const tagged = new Set(assigned.map(r=>r.entityId));
        filtered = filtered.filter(c=>tagged.has(c.id));
      }
      const total=filtered.length;
      const selected=filtered.slice((page-1)*CONTACTS_PAGE_SIZE,page*CONTACTS_PAGE_SIZE);
      const links=selected.length ? await tx.tagAssignment.findMany({
        where: { entityType: "CONTACT", entityId: { in: selected.map(c=>c.id) } },
        include: { tag: true },
      }) : [];
      const tags: Record<string, TagRow[]> = {};
      for (const link of links)
        (tags[link.entityId] ??= []).push({ id: link.tag.id, name: link.tag.name, color: link.tag.color });
      return { rows:selected.map(c=>({
        id:c.id, firstName:c.firstName, lastName:c.lastName,
        name:[c.firstName,c.lastName].filter(Boolean).join(" "),
        email:c.email, phone:c.phone, title:c.title, companyId:c.companyId,
        companyName:c.company?.name ?? null, ownerUserId:c.ownerUserId,
        createdAt:c.createdAt.toISOString(), tags:tags[c.id] ?? [],
      })), total, page, pageCount:Math.max(1,Math.ceil(total/CONTACTS_PAGE_SIZE)),
      owners, companies:companyOptions };
    });
}
export async function getContactRelations(contactId: string): Promise<{
  company: LinkedCompany | null; deals: LinkedDeal[];
}> {
  const user = await memberId();
  const { db } = getTenantDb();
  return withLegacyCrmTransaction(db, user, "record:read", "CONTACT", contactId,
    "LEGACY_CONTACT_RELATIONS_READ", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "CONTACT", contactId, "record:read");
      const contact=await tx.contact.findUnique({
        where:{id:contactId},include:{company:true},
      });
      const deals=await tx.deal.findMany({where:{contactId},
        orderBy:{updatedAt:"desc"},take:50});
      const visible:LinkedDeal[]=[];
      for(const deal of deals) {
        try {
          await assertLegacyCrmRecord(tx,actor,"DEAL",deal.id,"record:read");
          visible.push({id:deal.id,name:deal.name,amountCents:Number(deal.amountCents),status:deal.status});
        }catch(e){if(!(e instanceof PermissionError))throw e;}
      }
      let company:LinkedCompany|null=null;
      if(contact?.company) {
        try {
          await assertLegacyCrmRecord(tx,actor,"COMPANY",contact.company.id,"record:read");
          const c=contact.company;
          company={id:c.id,name:c.name,domain:c.domain,industry:c.industry};
        }catch(e){if(!(e instanceof PermissionError))throw e;}
      }
      return {company,deals:visible};
    });
}
