"use server";

/*
 * Deals server actions. All DB access goes through getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";

export async function moveDealToStage(dealId: string, stageId: string) {
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
  revalidatePath("/app/deals");
}

export async function createDeal(input: {
  name: string;
  pipelineId: string;
  stageId: string;
  amountCents?: number;
  contactId?: string;
}) {
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
  revalidatePath("/app/deals");
  return deal.id;
}
