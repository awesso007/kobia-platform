/*
 * Custom-fields query helpers (server-only). Read through getTenantDb().
 * getCustomFieldsFor returns the field definitions for an entity type ordered
 * for display; getCustomFieldValuesFor returns a { fieldId: value } map for a
 * single record so create/edit forms can hydrate.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { CustomFieldDef, CustomFieldValueMap, EntityType } from "@/lib/crm/record";

function toOptions(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map((v) => String(v));
  return null;
}

export async function getCustomFieldsFor(entityType: EntityType): Promise<CustomFieldDef[]> {
  const { db } = getTenantDb();
  const rows = await db.customField.findMany({
    where: { entityType },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType as EntityType,
    key: r.key,
    label: r.label,
    type: r.type as CustomFieldDef["type"],
    options: toOptions(r.options),
    required: r.required,
    order: r.order,
  }));
}

export async function getCustomFieldValuesFor(
  entityType: EntityType,
  entityId: string,
): Promise<CustomFieldValueMap> {
  const { db } = getTenantDb();
  const rows = await db.customFieldValue.findMany({
    where: { entityType, entityId },
  });
  const map: CustomFieldValueMap = {};
  for (const r of rows) map[r.customFieldId] = r.value;
  return map;
}
