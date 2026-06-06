"use server";

/*
 * Contacts server actions. All DB access goes through getTenantDb(). Create and
 * update accept optional tag ids + a custom-field value map, persisted via the
 * shared engines. Every mutation writes an audit entry.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { setEntityTags } from "../settings/tags/actions";
import { saveCustomFieldValues } from "../settings/custom-fields/actions";

export type ContactInput = {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  companyId?: string;
  ownerUserId?: string;
  tagIds?: string[];
  customFields?: Record<string, unknown>;
};

function dataFrom(input: ContactInput) {
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

export async function createContact(input: ContactInput) {
  const firstName = input.firstName?.trim();
  if (!firstName) throw new Error("Contact first name is required.");
  const { db } = getTenantDb();
  const contact = await db.contact.create({ data: dataFrom(input) });

  if (input.tagIds) await setEntityTags({ entityType: "CONTACT", entityId: contact.id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "CONTACT", entityId: contact.id, values: input.customFields });

  await auditWrite({ action: "CREATE", entityType: "CONTACT", entityId: contact.id, diff: { firstName } });
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "CONTACT", entityId: contact.id });
  revalidatePath("/app/contacts");
  return contact.id;
}

export async function updateContact(id: string, input: ContactInput) {
  const firstName = input.firstName?.trim();
  if (!firstName) throw new Error("Contact first name is required.");
  const { db } = getTenantDb();
  await db.contact.update({ where: { id }, data: dataFrom(input) });

  if (input.tagIds) await setEntityTags({ entityType: "CONTACT", entityId: id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "CONTACT", entityId: id, values: input.customFields });

  await auditWrite({ action: "UPDATE", entityType: "CONTACT", entityId: id, diff: dataFrom(input) });
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "CONTACT", entityId: id });
  revalidatePath("/app/contacts");
}

export async function deleteContact(id: string) {
  const { db } = getTenantDb();
  await db.contact.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "CONTACT", entityId: id });
  revalidatePath("/app/contacts");
}

/** Load linked company + deals + tag ids + custom-field values for the pane. */
export async function loadContactDetail(id: string) {
  const { getContactRelations } = await import("./queries");
  const { getTagsForEntity } = await import("@/lib/crm/tags");
  const { getCustomFieldValuesFor } = await import("@/lib/crm/custom-fields");
  const [relations, tags, customValues] = await Promise.all([
    getContactRelations(id),
    getTagsForEntity("CONTACT", id),
    getCustomFieldValuesFor("CONTACT", id),
  ]);
  return { relations, tagIds: tags.map((t) => t.id), customValues };
}
