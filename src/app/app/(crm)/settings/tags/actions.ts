"use server";

/*
 * Tag server actions. Tags are tenant-scoped, so all DB access goes through
 * getTenantDb(). setEntityTags replaces the full tag set for one record (used by
 * the multi-select picker on Lead/Deal/Contact/Company create + edit).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { ENTITY_TYPES, type EntityType } from "@/lib/crm/record";
import { getCurrentMembership, PermissionError, requirePermission } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";

function asEntityType(v: unknown): EntityType {
  return ENTITY_TYPES.includes(v as EntityType) ? (v as EntityType) : "LEAD";
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function asColor(v: unknown): string {
  return typeof v === "string" && HEX.test(v) ? v : "#1d77bd";
}

export async function createTag(input: { name: string; color?: string }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Tag name is required.");
  const { db } = getTenantDb();
  const tag = await db.tag.create({ data: { name, color: asColor(input.color) } });
  revalidatePath("/app/settings/tags");
  return tag.id;
}

export async function updateTag(id: string, input: { name?: string; color?: string }) {
  const { db } = getTenantDb();
  const data: { name?: string; color?: string } = {};
  if (input.name?.trim()) data.name = input.name.trim();
  if (input.color !== undefined) data.color = asColor(input.color);
  await db.tag.update({ where: { id }, data });
  revalidatePath("/app/settings/tags");
}

export async function deleteTag(id: string) {
  const { db } = getTenantDb();
  await db.tag.delete({ where: { id } });
  revalidatePath("/app/settings/tags");
}

/** Replace the full set of tags assigned to a single record. */
export async function setEntityTags(input: {
  entityType: string; entityId: string; tagIds: string[];
}) {
  // Directly callable server action; do not rely on its parent form's guard.
  if (!ENTITY_TYPES.includes(input.entityType as EntityType))
    throw new PermissionError("record:update");
  const actor = await getCurrentMembership();
  if (!actor || actor.status !== "ACTIVE") throw new PermissionError("record:update");
  if (!Array.isArray(input.tagIds) || input.tagIds.length > 40)
    throw new PermissionError("record:update");
  const ids = [...new Set(input.tagIds)];
  if (ids.some(id => typeof id !== "string" || id.length > 128))
    throw new PermissionError("record:update");
  const { db } = getTenantDb();
  const entity = input.entityType as EntityType;
  await withLegacyCrmTransaction(db, actor.clerkUserId, "record:update",
    entity, input.entityId, "LEGACY_CRM_TAGS_UPDATED", async (tx, live) => {
      await assertLegacyCrmRecord(tx, live, entity, input.entityId, "record:update");
      const matched = await tx.tag.count({ where: { id: { in: ids } } });
      if (matched !== ids.length) throw new PermissionError("record:update");
      await tx.tagAssignment.deleteMany({
        where: { entityType: entity, entityId: input.entityId },
      });
      if (ids.length) await tx.tagAssignment.createMany({
        data: ids.map(tagId => ({ entityType: entity, entityId: input.entityId, tagId })),
      });
    });
}
