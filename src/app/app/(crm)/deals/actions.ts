"use server";

/**
 * Round 56: Deal stage changes and related contact/client selection cannot
 * bypass current CHESS service grants. The deal, target stage and any linked
 * contact/company must be verified inside one serializable transaction,
 * with the security event inserted before returning successful mutation.
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex } from "@/lib/search";
import {
  withLegacyCrmTransaction, assertLegacyCrmRecord,
  verifyLegacyCrmCreateOwner,
} from "@/lib/chess/legacy-crm-security-round56";
import { writeLegacyCrmMetadata } from "@/lib/chess/legacy-crm-metadata-round56";

async function actorId() {
  const actor = await getCurrentMembership();
  if (!actor || actor.status !== "ACTIVE") throw new PermissionError("record:read");
  return actor.clerkUserId;
}
async function committed(id: string, type: "RECORD_CREATED" | "RECORD_UPDATED" | "STAGE_CHANGED") {
  const { db } = getTenantDb();
  await Promise.allSettled([
    dispatchAutomation({ type, entityType: "DEAL", entityId: id,
      ...(type === "STAGE_CHANGED" ? { changedFields: ["stageId", "status"] } : {}) }),
    reindex(db, "DEAL", id),
  ]);
  revalidatePath("/app/deals");
}
export async function moveDealToStage(dealId: string, stageId: string) {
  const user = await actorId();
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, user, "record:update",
    "DEAL", dealId, "LEGACY_DEAL_STAGE_CHANGED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "DEAL", dealId, "record:update");
      const deal = await tx.deal.findUniqueOrThrow({
        where: { id: dealId }, select: { pipelineId: true },
      });
      const stage = await tx.dealStage.findUnique({
        where: { id: stageId },
        include: { pipeline: { select: { entityType: true, archivedAt: true } } },
      });
      if (!stage || stage.pipelineId !== deal.pipelineId ||
          stage.pipeline.entityType !== "DEAL" || stage.pipeline.archivedAt)
        throw new PermissionError("record:update");
      await tx.deal.update({
        where: { id: dealId },
        data: { stageId, status: stage.isWon ? "WON" : stage.isLost ? "LOST" : "OPEN",
          wonAt: stage.isWon ? new Date() : null,
          lostAt: stage.isLost ? new Date() : null },
      });
    });
  await committed(dealId, "STAGE_CHANGED");
}
export async function createDeal(input: {
  name: string; pipelineId: string; stageId: string;
  amountCents?: number; contactId?: string; tagIds?: string[];
  customFields?: Record<string, unknown>;
}) {
  if (!input || typeof input.name !== "string" ||
      !input.name.trim() || input.name.length > 200 ||
      !Number.isSafeInteger(input.amountCents ?? 0) ||
      (input.amountCents ?? 0) < 0)
    throw new Error("Invalid deal.");
  const user = await actorId();
  const { db } = getTenantDb();
  const result = await withLegacyCrmTransaction(db, user, "record:create",
    "DEAL", "NEW", "LEGACY_DEAL_CREATED", async (tx, actor) => {
      const stage = await tx.dealStage.findUnique({
        where: { id: input.stageId },
        include: { pipeline: { select: { id: true, entityType: true, archivedAt: true } } },
      });
      if (!stage || stage.pipelineId !== input.pipelineId ||
          stage.pipeline.entityType !== "DEAL" || stage.pipeline.archivedAt)
        throw new PermissionError("record:create");
      if (input.contactId)
        await assertLegacyCrmRecord(tx, actor, "CONTACT", input.contactId, "record:read");
      const owner = await verifyLegacyCrmCreateOwner(tx, actor, null);
      const deal = await tx.deal.create({
        data: { name: input.name.trim(), pipelineId: input.pipelineId, stageId: input.stageId,
          amountCents: BigInt(input.amountCents ?? 0),
          contactId: input.contactId || null, ownerUserId: owner },
        select: { id: true },
      });
      await writeLegacyCrmMetadata(tx, "DEAL", deal.id, input);
      return deal.id;
    });
  await committed(result, "RECORD_CREATED");
  return result;
}
export async function updateDealMeta(
  id: string, input: { tagIds?: string[]; customFields?: Record<string, unknown> },
) {
  const user = await actorId();
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, user, "record:update",
    "DEAL", id, "LEGACY_DEAL_META_UPDATED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "DEAL", id, "record:update");
      await writeLegacyCrmMetadata(tx, "DEAL", id, input);
    });
  await committed(id, "RECORD_UPDATED");
}
export async function loadDealDetail(id: string) {
  const user = await actorId();
  const { db } = getTenantDb();
  return withLegacyCrmTransaction(db, user, "record:read",
    "DEAL", id, "LEGACY_DEAL_DETAIL_READ", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, "DEAL", id, "record:read");
      const [tags, values] = await Promise.all([
        tx.tagAssignment.findMany({ where: { entityType: "DEAL", entityId: id } }),
        tx.customFieldValue.findMany({ where: { entityType: "DEAL", entityId: id } }),
      ]);
      return {
        tagIds: tags.map(t => t.tagId),
        customValues: Object.fromEntries(values.map(v => [v.customFieldId, v.value])),
      };
    });
}
