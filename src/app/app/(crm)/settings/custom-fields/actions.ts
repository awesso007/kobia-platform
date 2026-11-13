"use server";

/*
 * Custom-field server actions. Field definitions are tenant-scoped (one set per
 * tenant), so all DB access goes through getTenantDb(). setCustomFieldValue is
 * called by entity create/edit forms (Leads/Deals/Contacts/Companies) to upsert
 * a single value.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";
import { writeLegacyCrmMetadata } from "@/lib/chess/legacy-crm-metadata-round56";
import {
  CUSTOM_FIELD_TYPES,
  ENTITY_TYPES,
  type CustomFieldType,
  type EntityType,
} from "@/lib/crm/record";

function asEntityType(v: unknown): EntityType {
  return ENTITY_TYPES.includes(v as EntityType) ? (v as EntityType) : "LEAD";
}
function asFieldType(v: unknown): CustomFieldType {
  return CUSTOM_FIELD_TYPES.includes(v as CustomFieldType) ? (v as CustomFieldType) : "TEXT";
}

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "field";
}

export type CustomFieldInput = {
  entityType: string;
  label: string;
  key?: string;
  type: string;
  options?: string[];
  required?: boolean;
};

export async function createCustomField(input: CustomFieldInput) {
  const label = input.label?.trim();
  if (!label) throw new Error("Field label is required.");
  const { db } = getTenantDb();
  const entityType = asEntityType(input.entityType);
  const type = asFieldType(input.type);
  const key = (input.key?.trim() ? slugifyKey(input.key) : slugifyKey(label));

  const max = await db.customField.aggregate({
    where: { entityType },
    _max: { order: true },
  });
  const order = (max._max.order ?? -1) + 1;

  const needsOptions = type === "SELECT" || type === "MULTI_SELECT";
  const options = needsOptions ? (input.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined;

  const field = await db.customField.create({
    data: {
      entityType,
      key,
      label,
      type,
      required: Boolean(input.required),
      order,
      options: options as never,
    },
  });
  await auditWrite({ action: "CREATE", entityType, entityId: field.id, diff: { label, type, key } });
  revalidatePath("/app/settings/custom-fields");
  return field.id;
}

export async function updateCustomField(id: string, input: CustomFieldInput) {
  const label = input.label?.trim();
  if (!label) throw new Error("Field label is required.");
  const { db } = getTenantDb();
  const type = asFieldType(input.type);
  const needsOptions = type === "SELECT" || type === "MULTI_SELECT";
  const options = needsOptions ? (input.options ?? []).map((o) => o.trim()).filter(Boolean) : [];
  const existing = await db.customField.findUniqueOrThrow({ where: { id } });

  await db.customField.update({
    where: { id },
    data: {
      label,
      type,
      required: Boolean(input.required),
      options: options as never,
    },
  });
  await auditWrite({
    action: "UPDATE",
    entityType: existing.entityType as EntityType,
    entityId: id,
    diff: { label, type, required: Boolean(input.required) },
  });
  revalidatePath("/app/settings/custom-fields");
}

export async function deleteCustomField(id: string) {
  const { db } = getTenantDb();
  const existing = await db.customField.findUniqueOrThrow({ where: { id } });
  await db.customField.delete({ where: { id } });
  await auditWrite({
    action: "DELETE",
    entityType: existing.entityType as EntityType,
    entityId: id,
    diff: { label: existing.label },
  });
  revalidatePath("/app/settings/custom-fields");
}

export async function reorderCustomFields(entityType: string, orderedIds: string[]) {
  const { db } = getTenantDb();
  const et = asEntityType(entityType);
  await db.$transaction(
    orderedIds.map((id, idx) =>
      db.customField.update({ where: { id }, data: { order: idx } }),
    ),
  );
  await auditWrite({ action: "UPDATE", entityType: et, entityId: "reorder", diff: { orderedIds } });
  revalidatePath("/app/settings/custom-fields");
}

/**
 * Upsert a single custom-field value for an entity record. value is the raw JSON
 * the field type expects (string, number, boolean, or string[]). A null/empty
 * value deletes the row.
 */
export async function setCustomFieldValue(input: {
  customFieldId: string; entityType: string; entityId: string; value: unknown;
}) {
  // Direct server action, not a trusted helper. Verify parent and definition.
  if (!ENTITY_TYPES.includes(input.entityType as EntityType))
    throw new PermissionError("record:update");
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:update");
  const entity = input.entityType as EntityType;
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, member.clerkUserId, "record:update",
    entity, input.entityId, "LEGACY_CRM_FIELD_UPDATED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, entity, input.entityId, "record:update");
      await writeLegacyCrmMetadata(tx, entity, input.entityId, {
        customFields: { [input.customFieldId]: input.value },
      });
    });
}

/**
 * Do not expose a custom-field-value write bypass through a directly callable
 * server action. All row/field/grant/actor checks and the security event share
 * one transaction. An unknown field or a revoked client permission fails closed.
 */
export async function saveCustomFieldValues(input: {
  entityType: string; entityId: string; values: Record<string, unknown>;
}) {
  if (!ENTITY_TYPES.includes(input.entityType as EntityType))
    throw new PermissionError("record:update");
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:update");
  const entity = input.entityType as EntityType;
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, member.clerkUserId, "record:update",
    entity, input.entityId, "LEGACY_CRM_FIELDS_UPDATED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, entity, input.entityId, "record:update");
      await writeLegacyCrmMetadata(tx, entity, input.entityId, {
        customFields: input.values,
      });
    });
}
