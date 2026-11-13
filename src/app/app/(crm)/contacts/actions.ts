"use server";

/**
 * Round 56 Contact server actions: a Contact may be a CHESS ClientProfile,
 * so ownership alone never permits reading its service details. Current
 * ClientServiceGrant and exactly one historical business are checked inside
 * the same SERIALIZABLE transaction that reads/writes and audits records.
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { notify } from "@/lib/notifications/notify";
import { reindex, removeFromIndex } from "@/lib/search";
import {
  withLegacyCrmTransaction, assertLegacyCrmRecord,
  verifyLegacyCrmCreateOwner,
} from "@/lib/chess/legacy-crm-security-round56";
import { writeLegacyCrmMetadata } from "@/lib/chess/legacy-crm-metadata-round56";

export type ContactInput = {
  firstName: string; lastName?: string; email?: string; phone?: string;
  title?: string; companyId?: string; ownerUserId?: string;
  tagIds?: string[]; customFields?: Record<string, unknown>;
};
function dataFrom(input: ContactInput) {
  if (!input || typeof input.firstName !== "string" ||
      !input.firstName.trim() || input.firstName.length > 200)
    throw new Error("Invalid contact first name.");
  for (const value of [input.lastName, input.email, input.phone, input.title,
    input.companyId, input.ownerUserId]) {
    if (value !== undefined && (typeof value !== "string" || value.length > 320))
      throw new Error("Invalid contact details.");
  }
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    title: input.title?.trim() || null,
    companyId: input.companyId?.trim() || null,
    ownerUserId: input.ownerUserId?.trim() || null,
  };
}
async function actorId(): Promise<string> {
  const m = await getCurrentMembership();
  if (!m || m.status !== "ACTIVE") throw new PermissionError("record:read");
  return m.clerkUserId;
}
async function afterCommit(db: ReturnType<typeof getTenantDb>["db"], id: string,
  kind: "RECORD_CREATED" | "RECORD_UPDATED") {
  await Promise.allSettled([
    dispatchAutomation({ type: kind, entityType: "CONTACT", entityId: id }),
    reindex(db, "CONTACT", id),
  ]);
  revalidatePath("/app/contacts");
}
export async function createContact(input: ContactInput) {
  const data = dataFrom(input);
  const user = await actorId();
  const { db } = getTenantDb();
  const result = await withLegacyCrmTransaction(db, user, "record:create",
    "CONTACT", "NEW", "LEGACY_CONTACT_CREATED", async (tx, actor) => {
      const owner = await verifyLegacyCrmCreateOwner(tx, actor, data.ownerUserId);
      if (data.companyId)
        await assertLegacyCrmRecord(tx, actor, "COMPANY", data.companyId, "record:read");
      const contact = await tx.contact.create({
        data: { ...data, ownerUserId: owner }, select: { id: true },
      });
      await writeLegacyCrmMetadata(tx, "CONTACT", contact.id, input);
      return { id: contact.id, owner };
    });
  await afterCommit(db, result.id, "RECORD_CREATED");
  if (result.owner && result.owner !== user)
    await notify(result.owner, {
      type: "ASSIGNMENT", title: "You were assigned a contact: " + data.firstName,
      linkUrl: "/app/contacts",
    }).catch(() => undefined);
  return result.id;
}
export async function updateContact(id: string, input: ContactInput) {
  const data = dataFrom(input);
  const user = await actorId();
  const { db } = getTenantDb();
  const result = await withLegacyCrmTransaction(db, user, "record:update",
    "CONTACT", id, "LEGACY_CONTACT_UPDATED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "CONTACT", id, "record:update");
      const original = await tx.contact.findUniqueOrThrow({
        where: { id }, select: { ownerUserId: true },
      });
      const owner = await verifyLegacyCrmCreateOwner(
        tx, actor, data.ownerUserId ?? original.ownerUserId,
      );
      if (data.companyId)
        await assertLegacyCrmRecord(tx, actor, "COMPANY", data.companyId, "record:read");
      await tx.contact.update({ where: { id }, data: { ...data, ownerUserId: owner } });
      await writeLegacyCrmMetadata(tx, "CONTACT", id, input);
      return { owner, before: original.ownerUserId };
    });
  await afterCommit(db, id, "RECORD_UPDATED");
  if (result.owner && result.owner !== result.before)
    await notify(result.owner, {
      type: "ASSIGNMENT", title: "You were assigned a contact: " + data.firstName,
      linkUrl: "/app/contacts",
    }).catch(() => undefined);
}
export async function deleteContact(id: string) {
  const user = await actorId();
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, user, "record:delete",
    "CONTACT", id, "LEGACY_CONTACT_DELETED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "CONTACT", id, "record:delete");
      const linked = await tx.clientProfile.findUnique({
        where: { contactId: id }, select: { id: true },
      });
      // Do not cascade/delete a client's regulated service identity.
      if (linked) throw new PermissionError("record:delete");
      await tx.contact.delete({ where: { id } });
    });
  await removeFromIndex(db, "CONTACT", id).catch(() => undefined);
  revalidatePath("/app/contacts");
}
export async function loadContactDetail(id: string) {
  const user = await actorId();
  const { db } = getTenantDb();
  return withLegacyCrmTransaction(db, user, "record:read",
    "CONTACT", id, "LEGACY_CONTACT_DETAIL_READ", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "CONTACT", id, "record:read");
      const [row, deals, tags, values] = await Promise.all([
        tx.contact.findUniqueOrThrow({
          where: { id }, include: { company: true },
        }),
        tx.deal.findMany({ where: { contactId: id },
          orderBy: { updatedAt: "desc" }, take: 50 }),
        tx.tagAssignment.findMany({ where: { entityType: "CONTACT", entityId: id } }),
        tx.customFieldValue.findMany({ where: { entityType: "CONTACT", entityId: id } }),
      ]);
      const visibleDeals = [];
      for (const deal of deals) {
        try {
          await assertLegacyCrmRecord(tx, actor, "DEAL", deal.id, "record:read");
          visibleDeals.push({ id: deal.id, name: deal.name,
            amountCents: Number(deal.amountCents), status: deal.status });
        } catch (error) {
          if (!(error instanceof PermissionError)) throw error;
        }
      }
      return {
        relations: {
          company: row.company ? { id: row.company.id, name: row.company.name,
            domain: row.company.domain, industry: row.company.industry } : null,
          deals: visibleDeals,
        },
        tagIds: tags.map(t => t.tagId),
        customValues: Object.fromEntries(values.map(v => [v.customFieldId, v.value])),
      };
    });
}
