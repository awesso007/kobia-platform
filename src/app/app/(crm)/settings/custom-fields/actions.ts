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
  customFieldId: string;
  entityType: string;
  entityId: string;
  value: unknown;
}) {
  const { db } = getTenantDb();
  const entityType = asEntityType(input.entityType);
  const empty =
    input.value === null ||
    input.value === undefined ||
    input.value === "" ||
    (Array.isArray(input.value) && input.value.length === 0);

  if (empty) {
    await db.customFieldValue.deleteMany({
      where: { customFieldId: input.customFieldId, entityId: input.entityId },
    });
    return;
  }

  await db.customFieldValue.upsert({
    where: { customFieldId_entityId: { customFieldId: input.customFieldId, entityId: input.entityId } },
    create: {
      customFieldId: input.customFieldId,
      entityType,
      entityId: input.entityId,
      value: input.value as never,
    },
    update: { value: input.value as never },
  });
}

/**
 * Upsert a batch of custom-field values for one record. Used by entity create
 * and edit flows that collect all field values in a single { fieldId: value }
 * map. Skips unknown fields (they may have been deleted between load and save).
 */
export async function saveCustomFieldValues(input: {
  entityType: string;
  entityId: string;
  values: Record<string, unknown>;
}) {
  const { db } = getTenantDb();
  const entityType = asEntityType(input.entityType);
  const fieldIds = Object.keys(input.values);
  if (fieldIds.length === 0) return;

  const known = await db.customField.findMany({
    where: { entityType, id: { in: fieldIds } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((k) => k.id));

  for (const fieldId of fieldIds) {
    if (!knownIds.has(fieldId)) continue;
    const value = input.values[fieldId];
    const empty =
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      await db.customFieldValue.deleteMany({ where: { customFieldId: fieldId, entityId: input.entityId } });
    } else {
      await db.customFieldValue.upsert({
        where: { customFieldId_entityId: { customFieldId: fieldId, entityId: input.entityId } },
        create: { customFieldId: fieldId, entityType, entityId: input.entityId, value: value as never },
        update: { value: value as never },
      });
    }
  }
}
