/*
 * Tag query helpers (server-only). listTags returns all tenant tags;
 * getTagsForEntity returns the tags assigned to a single record;
 * getTagMapForEntities batch-loads tag rows for a set of records so list views
 * can render chips without an N+1.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { EntityType, TagRow } from "@/lib/crm/record";

export async function listTags(): Promise<TagRow[]> {
  const { db } = getTenantDb();
  const rows = await db.tag.findMany({ orderBy: { name: "asc" } });
  return rows.map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

export async function getTagsForEntity(entityType: EntityType, entityId: string): Promise<TagRow[]> {
  const { db } = getTenantDb();
  const rows = await db.tagAssignment.findMany({
    where: { entityType, entityId },
    include: { tag: true },
  });
  return rows.map((a) => ({ id: a.tag.id, name: a.tag.name, color: a.tag.color }));
}

/** Batch: returns { entityId: TagRow[] } for a list of records of one type. */
export async function getTagMapForEntities(
  entityType: EntityType,
  entityIds: string[],
): Promise<Record<string, TagRow[]>> {
  const map: Record<string, TagRow[]> = {};
  if (entityIds.length === 0) return map;
  const { db } = getTenantDb();
  const rows = await db.tagAssignment.findMany({
    where: { entityType, entityId: { in: entityIds } },
    include: { tag: true },
  });
  for (const a of rows) {
    (map[a.entityId] ??= []).push({ id: a.tag.id, name: a.tag.name, color: a.tag.color });
  }
  return map;
}
