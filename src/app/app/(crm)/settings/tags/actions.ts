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
  entityType: string;
  entityId: string;
  tagIds: string[];
}) {
  const { db } = getTenantDb();
  const entityType = asEntityType(input.entityType);
  const tagIds = Array.from(new Set(input.tagIds));

  await db.$transaction([
    db.tagAssignment.deleteMany({
      where: { entityType, entityId: input.entityId, tagId: { notIn: tagIds.length ? tagIds : ["__none__"] } },
    }),
    ...tagIds.map((tagId) =>
      db.tagAssignment.upsert({
        where: {
          tagId_entityType_entityId: { tagId, entityType, entityId: input.entityId },
        },
        create: { tagId, entityType, entityId: input.entityId },
        update: {},
      }),
    ),
  ]);
  await auditWrite({ action: "UPDATE", entityType, entityId: input.entityId, diff: { tagIds } });
}
