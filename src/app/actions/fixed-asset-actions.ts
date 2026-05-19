"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getTenantBySlug } from "@/lib/tenant";
import { getActiveEntity } from "@/lib/active-entity";
import { postJournalEntry } from "@/lib/accounting/ledger";
import {
  postDepreciationForMonth,
  postMonthlyDepreciationForEntity,
} from "@/lib/accounting/depreciation";

function parseMoney(input: string | null): bigint {
  if (!input) return 0n;
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0n;
  const num = Number(cleaned);
  if (!isFinite(num)) return 0n;
  return BigInt(Math.round(num * 100));
}

async function resolveContext(slug: string) {
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");
  const entity = await getActiveEntity({ tenantId: tenant.id, tenantSlug: slug });
  if (!entity) throw new Error("No active entity");
  return { tenant, entity };
}

/**
 * Create a fixed asset.
 * Optionally posts a capitalization JE if a "cash/credit" account is provided
 * (debit asset account, credit cash/AP/loan account).
 */
export async function createFixedAssetAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { tenant, entity } = await resolveContext(slug);
  const { userId } = await auth();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const acquisitionDate = new Date(String(formData.get("acquisitionDate")));
  const costCents = parseMoney(String(formData.get("cost") ?? ""));
  const salvageValueCents = parseMoney(String(formData.get("salvage") ?? "0"));
  const usefulLifeMonths = Number(formData.get("usefulLifeMonths") ?? 0);

  const assetAccountId = String(formData.get("assetAccountId") ?? "");
  const accumulatedDepreciationAccountId = String(formData.get("accumulatedDepreciationAccountId") ?? "");
  const depreciationExpenseAccountId = String(formData.get("depreciationExpenseAccountId") ?? "");
  const fundingAccountId = String(formData.get("fundingAccountId") ?? ""); // optional

  if (!name) throw new Error("Asset name required");
  if (costCents <= 0n) throw new Error("Cost must be greater than zero");
  if (usefulLifeMonths <= 0) throw new Error("Useful life must be at least 1 month");
  if (!assetAccountId || !accumulatedDepreciationAccountId || !depreciationExpenseAccountId) {
    throw new Error("Asset, accumulated depreciation, and depreciation expense accounts are all required");
  }

  const asset = await db.fixedAsset.create({
    data: {
      tenantId: tenant.id,
      entityId: entity.id,
      name,
      description,
      category,
      acquisitionDate,
      costCents,
      salvageValueCents,
      usefulLifeMonths,
      method: "STRAIGHT_LINE",
      status: "ACTIVE",
      assetAccountId,
      accumulatedDepreciationAccountId,
      depreciationExpenseAccountId,
      createdByUserId: userId ?? undefined,
    },
  });

  // Capitalization JE: DR Asset / CR Funding account (if provided).
  if (fundingAccountId) {
    await postJournalEntry(
      {
        tenantId: tenant.id,
        entityId: entity.id,
        entryDate: acquisitionDate,
        description: `Capitalized ${name}`,
        source: "ASSET_PURCHASE",
        sourceRefId: asset.id,
        lines: [
          { accountId: assetAccountId, debitCents: costCents, creditCents: 0n },
          { accountId: fundingAccountId, debitCents: 0n, creditCents: costCents },
        ],
      },
      { postedByUserId: userId ?? undefined }
    );
  }

  revalidatePath(`/${slug}/books/assets`);
  redirect(`/${slug}/books/assets/${asset.id}`);
}

/** Post depreciation for one asset for one month. */
export async function postDepreciationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const fixedAssetId = String(formData.get("fixedAssetId") ?? "");
  const year = Number(formData.get("year"));
  const monthIdx = Number(formData.get("monthIdx"));
  await resolveContext(slug);
  const { userId } = await auth();
  await postDepreciationForMonth({
    fixedAssetId,
    year,
    monthIdx,
    postedByUserId: userId ?? undefined,
  });
  revalidatePath(`/${slug}/books/assets/${fixedAssetId}`);
  revalidatePath(`/${slug}/books/assets`);
}

/** Post depreciation for ALL active assets, for a target month. */
export async function postBulkDepreciationAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const year = Number(formData.get("year"));
  const monthIdx = Number(formData.get("monthIdx"));
  const { entity } = await resolveContext(slug);
  const { userId } = await auth();
  await postMonthlyDepreciationForEntity({
    entityId: entity.id,
    year,
    monthIdx,
    postedByUserId: userId ?? undefined,
  });
  revalidatePath(`/${slug}/books/assets`);
}

/** Dispose an asset (no auto-write-off JE yet — that's a future enhancement). */
export async function disposeAssetAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const fixedAssetId = String(formData.get("fixedAssetId") ?? "");
  const disposedDate = new Date(String(formData.get("disposedDate") ?? new Date().toISOString()));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await resolveContext(slug);
  await db.fixedAsset.update({
    where: { id: fixedAssetId },
    data: { status: "DISPOSED", disposedDate, disposedNotes: notes },
  });
  revalidatePath(`/${slug}/books/assets/${fixedAssetId}`);
  revalidatePath(`/${slug}/books/assets`);
}
