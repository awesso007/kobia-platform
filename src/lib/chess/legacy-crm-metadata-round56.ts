/**
 * Round 56: tag and custom field changes are never independent, unaudited
 * transactions after the parent record has committed. Validate exact parent
 * entity type, known definitions, input bounds and write with parent tx.
 */
import type { Prisma } from "@/lib/db/generated/tenant";
import { PermissionError } from "@/lib/rbac/require-permission";
import type { LegacyCrmEntity } from "./legacy-crm-security-round56";

export async function writeLegacyCrmMetadata(
  tx: Prisma.TransactionClient, entityType: LegacyCrmEntity, entityId: string,
  input: { tagIds?: string[]; customFields?: Record<string, unknown> },
): Promise<void> {
  if (input.tagIds !== undefined) {
    if (!Array.isArray(input.tagIds) || input.tagIds.length > 40 ||
        input.tagIds.some(x => typeof x !== "string" || x.length > 128))
      throw new PermissionError("record:update");
    const ids = [...new Set(input.tagIds)];
    const count = await tx.tag.count({ where: { id: { in: ids } } });
    if (count !== ids.length) throw new PermissionError("record:update");
    await tx.tagAssignment.deleteMany({ where: { entityType, entityId } });
    if (ids.length) await tx.tagAssignment.createMany({
      data: ids.map(tagId => ({ entityType, entityId, tagId })),
    });
  }
  if (input.customFields !== undefined) {
    if (!input.customFields || typeof input.customFields !== "object" ||
        Array.isArray(input.customFields)) throw new PermissionError("record:update");
    const rows = Object.entries(input.customFields);
    if (rows.length > 30 || JSON.stringify(input.customFields).length > 8000)
      throw new PermissionError("record:update");
    const defs = await tx.customField.findMany({
      where: { entityType, id: { in: rows.map(([id]) => id) } },
      select: { id: true },
    });
    if (defs.length !== rows.length) throw new PermissionError("record:update");
    for (const [customFieldId, value] of rows) {
      const empty = value == null || value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        await tx.customFieldValue.deleteMany({
          where: { customFieldId, entityType, entityId },
        });
      } else {
        await tx.customFieldValue.upsert({
          where: { customFieldId_entityId: { customFieldId, entityId } },
          create: { customFieldId, entityType, entityId, value: value as never },
          update: { value: value as never },
        });
      }
    }
  }
}
