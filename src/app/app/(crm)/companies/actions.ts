"use server";

/**
 * Round 56: Company rows can aggregate contacts from several CHESS clients.
 * Do not infer access to all of them from a tenant role or just one owned
 * contact. Every linked client requires a current per-service READ/WRITE grant
 * inside the SAME serializable company read/mutation/audit transaction.
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { notify } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { COMPANY_SIZES } from "@/lib/crm/record";
import {
  withLegacyCrmTransaction, assertLegacyCrmRecord,
  verifyLegacyCrmCreateOwner,
} from "@/lib/chess/legacy-crm-security-round56";
import { writeLegacyCrmMetadata } from "@/lib/chess/legacy-crm-metadata-round56";

export type CompanyInput = {
  name: string; domain?: string; industry?: string; size?: string;
  website?: string; phone?: string; address?: string; ownerUserId?: string;
  tagIds?: string[]; customFields?: Record<string, unknown>;
};
const sizes = COMPANY_SIZES.map(s => s.value) as readonly string[];
function dataFrom(input: CompanyInput) {
  if (!input || typeof input.name !== "string" ||
      !input.name.trim() || input.name.length > 200)
    throw new Error("Invalid company name.");
  for (const value of [input.domain, input.industry, input.website, input.phone,
    input.address, input.ownerUserId]) {
    if (value !== undefined && (typeof value !== "string" || value.length > 500))
      throw new Error("Invalid company details.");
  }
  return {
    name: input.name.trim(), domain: input.domain?.trim() || null,
    industry: input.industry?.trim() || null,
    size: (typeof input.size === "string" && sizes.includes(input.size)
      ? input.size : null) as never,
    website: input.website?.trim() || null, phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    ownerUserId: input.ownerUserId?.trim() || null,
  };
}
async function actorId() {
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:read");
  return member.clerkUserId;
}
async function afterCommit(db: ReturnType<typeof getTenantDb>["db"], id: string,
  type: "RECORD_CREATED" | "RECORD_UPDATED") {
  await Promise.allSettled([
    dispatchAutomation({ type, entityType: "COMPANY", entityId: id }),
    reindex(db, "COMPANY", id),
  ]);
  revalidatePath("/app/companies");
}
export async function createCompany(input: CompanyInput) {
  const data = dataFrom(input);
  const user = await actorId();
  const { db } = getTenantDb();
  const result = await withLegacyCrmTransaction(db, user, "record:create",
    "COMPANY", "NEW", "LEGACY_COMPANY_CREATED", async (tx, actor) => {
      const owner = await verifyLegacyCrmCreateOwner(tx, actor, data.ownerUserId);
      const company = await tx.company.create({
        data: { ...data, ownerUserId: owner }, select: { id: true },
      });
      await writeLegacyCrmMetadata(tx, "COMPANY", company.id, input);
      return { id: company.id, owner };
    });
  await afterCommit(db, result.id, "RECORD_CREATED");
  if (result.owner && result.owner !== user)
    await notify(result.owner, {
      type: "ASSIGNMENT", title: "You were assigned a company: " + data.name,
      linkUrl: "/app/companies",
    }).catch(() => undefined);
  return result.id;
}
export async function updateCompany(id: string, input: CompanyInput) {
  const data = dataFrom(input);
  const user = await actorId();
  const { db } = getTenantDb();
  const result = await withLegacyCrmTransaction(db, user, "record:update",
    "COMPANY", id, "LEGACY_COMPANY_UPDATED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "COMPANY", id, "record:update");
      const original = await tx.company.findUniqueOrThrow({
        where: { id }, select: { ownerUserId: true },
      });
      const owner = await verifyLegacyCrmCreateOwner(
        tx, actor, data.ownerUserId ?? original.ownerUserId,
      );
      await tx.company.update({ where: { id }, data: { ...data, ownerUserId: owner } });
      await writeLegacyCrmMetadata(tx, "COMPANY", id, input);
      return { owner, before: original.ownerUserId };
    });
  await afterCommit(db, id, "RECORD_UPDATED");
  if (result.owner && result.owner !== result.before)
    await notify(result.owner, {
      type: "ASSIGNMENT", title: "You were assigned a company: " + data.name,
      linkUrl: "/app/companies",
    }).catch(() => undefined);
}
export async function deleteCompany(id: string) {
  const user = await actorId();
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, user, "record:delete",
    "COMPANY", id, "LEGACY_COMPANY_DELETED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "COMPANY", id, "record:delete");
      await tx.company.delete({ where: { id } });
    });
  await removeFromIndex(db, "COMPANY", id).catch(() => undefined);
  revalidatePath("/app/companies");
}
export async function loadCompanyDetail(id: string) {
  const user = await actorId();
  const { db } = getTenantDb();
  return withLegacyCrmTransaction(db, user, "record:read",
    "COMPANY", id, "LEGACY_COMPANY_DETAIL_READ", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "COMPANY", id, "record:read");
      const [contacts, deals, tags, values] = await Promise.all([
        tx.contact.findMany({ where: { companyId: id },
          orderBy: { createdAt: "desc" }, take: 50 }),
        tx.deal.findMany({ where: { companyId: id },
          orderBy: { updatedAt: "desc" }, take: 50 }),
        tx.tagAssignment.findMany({ where: { entityType: "COMPANY", entityId: id } }),
        tx.customFieldValue.findMany({ where: { entityType: "COMPANY", entityId: id } }),
      ]);
      // Company authorization covers all clients, but MEMBER still must own
      // each related record before including it in a sensitive detail pane.
      const eligibleContacts = [];
      for (const contact of contacts) {
        try {
          await assertLegacyCrmRecord(tx, actor, "CONTACT", contact.id, "record:read");
          eligibleContacts.push({ id: contact.id,
            name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
            email: contact.email, title: contact.title });
        } catch (error) { if (!(error instanceof PermissionError)) throw error; }
      }
      const eligibleDeals = [];
      for (const deal of deals) {
        try {
          await assertLegacyCrmRecord(tx, actor, "DEAL", deal.id, "record:read");
          eligibleDeals.push({ id: deal.id, name: deal.name,
            amountCents: Number(deal.amountCents), status: deal.status });
        } catch (error) { if (!(error instanceof PermissionError)) throw error; }
      }
      return {
        relations: { contacts: eligibleContacts, deals: eligibleDeals },
        tagIds: tags.map(t => t.tagId),
        customValues: Object.fromEntries(values.map(v => [v.customFieldId, v.value])),
      };
    });
}
