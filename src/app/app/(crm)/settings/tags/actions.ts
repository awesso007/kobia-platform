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
import { ENTITY_TYPES, type EntityType } from "@/lib/crm/record";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";

const HEX = /^#[0-9a-fA-F]{6}$/;
function asColor(v: unknown): string {
  return typeof v === "string" && HEX.test(v) ? v : "#1d77bd";
}

async function actorId() {
  const m = await getCurrentMembership();
  if (!m || m.status !== "ACTIVE") throw new PermissionError("tag:manage");
  return m.clerkUserId;
}
export async function createTag(input: { name: string; color?: string }) {
  const name = input.name?.trim();
  if (!name || name.length > 100) throw new Error("Invalid tag name.");
  const { db } = getTenantDb();
  const actor = await actorId();
  const id = await withLegacyCrmTransaction(db, actor, "tag:manage",
    "LEAD", "TAG", "LEGACY_TAG_CREATED", async tx => {
      const tag = await tx.tag.create({ data: { name, color: asColor(input.color) } });
      return tag.id;
    });
  revalidatePath("/app/settings/tags");
  return id;
}
export async function updateTag(id: string, input: { name?: string; color?: string }) {
  const { db } = getTenantDb();
  const actor = await actorId();
  const data: { name?: string; color?: string } = {};
  if (input.name !== undefined) {
    if (!input.name.trim() || input.name.length > 100) throw Error("Invalid tag name.");
    data.name = input.name.trim();
  }
  if (input.color !== undefined) data.color = asColor(input.color);
  await withLegacyCrmTransaction(db, actor, "tag:manage",
    "LEAD", id, "LEGACY_TAG_UPDATED", async tx => {
      await tx.tag.update({ where: { id }, data });
    });
  revalidatePath("/app/settings/tags");
}
export async function deleteTag(id: string) {
  const { db } = getTenantDb();
  const actor = await actorId();
  await withLegacyCrmTransaction(db, actor, "tag:manage",
    "LEAD", id, "LEGACY_TAG_DELETED", async tx => {
      await tx.tag.delete({ where: { id } });
    });
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
