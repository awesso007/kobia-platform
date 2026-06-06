"use server";

/*
 * Companies server actions. All DB access goes through getTenantDb(). Create and
 * update accept optional tag ids and a custom-field value map; tags + values are
 * persisted via the shared tag/custom-field engines. Every mutation writes an
 * audit entry.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission, isOwn } from "@/lib/rbac/require-permission";
import { notify } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { setEntityTags } from "../settings/tags/actions";
import { saveCustomFieldValues } from "../settings/custom-fields/actions";
import { COMPANY_SIZES } from "@/lib/crm/record";

const SIZE_VALUES = COMPANY_SIZES.map((s) => s.value) as readonly string[];
function asSize(v: unknown): string | null {
  return typeof v === "string" && SIZE_VALUES.includes(v) ? v : null;
}

export type CompanyInput = {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  phone?: string;
  address?: string;
  ownerUserId?: string;
  tagIds?: string[];
  customFields?: Record<string, unknown>;
};

function dataFrom(input: CompanyInput) {
  return {
    name: input.name.trim(),
    domain: input.domain?.trim() || null,
    industry: input.industry?.trim() || null,
    size: asSize(input.size) as never,
    website: input.website?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    ownerUserId: input.ownerUserId?.trim() || null,
  };
}

export async function createCompany(input: CompanyInput) {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Company name is required.");
  const { db } = getTenantDb();
  const company = await db.company.create({ data: dataFrom(input) });

  if (input.tagIds) await setEntityTags({ entityType: "COMPANY", entityId: company.id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "COMPANY", entityId: company.id, values: input.customFields });

  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: company.id, diff: { name } });
  const ownerId = input.ownerUserId?.trim();
  if (ownerId)
    await notify(ownerId, { type: "ASSIGNMENT", title: `You were assigned a company: ${name}`, linkUrl: "/app/companies" });
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "COMPANY", entityId: company.id });
  await reindex(db, "COMPANY", company.id);
  revalidatePath("/app/companies");
  return company.id;
}

export async function updateCompany(id: string, input: CompanyInput) {
  const { db } = getTenantDb();
  const before = await db.company.findUnique({ where: { id }, select: { ownerUserId: true } });
  await requirePermission("record:update", { ownsRecord: await isOwn(before?.ownerUserId) });
  const name = input.name?.trim();
  if (!name) throw new Error("Company name is required.");
  await db.company.update({ where: { id }, data: dataFrom(input) });

  if (input.tagIds) await setEntityTags({ entityType: "COMPANY", entityId: id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "COMPANY", entityId: id, values: input.customFields });

  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: dataFrom(input) });
  const ownerId = input.ownerUserId?.trim();
  if (ownerId && ownerId !== before?.ownerUserId)
    await notify(ownerId, { type: "ASSIGNMENT", title: `You were assigned a company: ${name}`, linkUrl: "/app/companies" });
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "COMPANY", entityId: id });
  await reindex(db, "COMPANY", id);
  revalidatePath("/app/companies");
}

export async function deleteCompany(id: string) {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.company.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id });
  await removeFromIndex(db, "COMPANY", id);
  revalidatePath("/app/companies");
}

/** Load related contacts/deals + tag ids + custom-field values for the pane. */
export async function loadCompanyDetail(id: string) {
  const { getCompanyRelations } = await import("./queries");
  const { getTagsForEntity } = await import("@/lib/crm/tags");
  const { getCustomFieldValuesFor } = await import("@/lib/crm/custom-fields");
  const [relations, tags, customValues] = await Promise.all([
    getCompanyRelations(id),
    getTagsForEntity("COMPANY", id),
    getCustomFieldValuesFor("COMPANY", id),
  ]);
  return { relations, tagIds: tags.map((t) => t.id), customValues };
}
