"use server";

/*
 * Deals server actions. All DB access goes through getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { setEntityTags } from "../settings/tags/actions";
import { saveCustomFieldValues } from "../settings/custom-fields/actions";

export async function moveDealToStage(dealId: string, stageId: string) {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const stage = await db.dealStage.findUniqueOrThrow({ where: { id: stageId } });
  await db.deal.update({
    where: { id: dealId },
    data: {
      stageId,
      status: stage.isWon ? "WON" : stage.isLost ? "LOST" : "OPEN",
      wonAt: stage.isWon ? new Date() : null,
      lostAt: stage.isLost ? new Date() : null,
    },
  });
  await auditWrite({ action: "UPDATE", entityType: "DEAL", entityId: dealId, diff: { stageId, status: stage.isWon ? "WON" : stage.isLost ? "LOST" : "OPEN" } });
  await dispatchAutomation({ type: "STAGE_CHANGED", entityType: "DEAL", entityId: dealId, changedFields: ["stageId", "status"] });
  revalidatePath("/app/deals");
}

export async function createDeal(input: {
  name: string;
  pipelineId: string;
  stageId: string;
  amountCents?: number;
  contactId?: string;
  tagIds?: string[];
  customFields?: Record<string, unknown>;
}) {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Deal name is required.");
  const { db } = getTenantDb();
  const deal = await db.deal.create({
    data: {
      name,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      amountCents: BigInt(input.amountCents ?? 0),
      contactId: input.contactId || null,
    },
  });

  if (input.tagIds) await setEntityTags({ entityType: "DEAL", entityId: deal.id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "DEAL", entityId: deal.id, values: input.customFields });

  await auditWrite({ action: "CREATE", entityType: "DEAL", entityId: deal.id, diff: { name } });
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "DEAL", entityId: deal.id });
  revalidatePath("/app/deals");
  return deal.id;
}

/** Persist tag + custom-field edits made in the Deal RecordPane Details tab. */
export async function updateDealMeta(
  id: string,
  input: { tagIds?: string[]; customFields?: Record<string, unknown> },
) {
  await requirePermission("record:update");
  if (input.tagIds) await setEntityTags({ entityType: "DEAL", entityId: id, tagIds: input.tagIds });
  if (input.customFields)
    await saveCustomFieldValues({ entityType: "DEAL", entityId: id, values: input.customFields });
  await auditWrite({ action: "UPDATE", entityType: "DEAL", entityId: id, diff: { meta: true } });
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "DEAL", entityId: id });
  revalidatePath("/app/deals");
}

/** Load tag ids + custom-field values for the Deal RecordPane Details tab. */
export async function loadDealDetail(id: string) {
  const { getTagsForEntity } = await import("@/lib/crm/tags");
  const { getCustomFieldValuesFor } = await import("@/lib/crm/custom-fields");
  const [tags, customValues] = await Promise.all([
    getTagsForEntity("DEAL", id),
    getCustomFieldValuesFor("DEAL", id),
  ]);
  return { tagIds: tags.map((t) => t.id), customValues };
}
