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
import { dispatchAutomation } from "@/lib/automations/dispatch";
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
  const name = input.name?.trim();
  if (!name) throw new Error("Company name is required.");
  const { db } = getTenantDb();
  const company = await db.company.create({ data: dataFrom(input) });

  if (input.tagIds) await setEntityTags({ entityType: "COMPANY", entityId: company.id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "COMPANY", entityId: company.id, values: input.customFields });

  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: company.id, diff: { name } });
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "COMPANY", entityId: company.id });
  revalidatePath("/app/companies");
  return company.id;
}

export async function updateCompany(id: string, input: CompanyInput) {
  const name = input.name?.trim();
  if (!name) throw new Error("Company name is required.");
  const { db } = getTenantDb();
  await db.company.update({ where: { id }, data: dataFrom(input) });

  if (input.tagIds) await setEntityTags({ entityType: "COMPANY", entityId: id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "COMPANY", entityId: id, values: input.customFields });

  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: dataFrom(input) });
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "COMPANY", entityId: id });
  revalidatePath("/app/companies");
}

export async function deleteCompany(id: string) {
  const { db } = getTenantDb();
  await db.company.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id });
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
