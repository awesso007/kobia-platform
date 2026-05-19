"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { postJournalEntry } from "@/lib/accounting/ledger";

function parseQtyMilli(s: string): bigint {
  const cleaned = s.trim().replace(/[,\s]/g, "");
  if (cleaned === "") return 0n;
  // Allow negative for "new quantity" if someone really wants to allow it; reject in caller.
  const sign = cleaned.startsWith("-") ? -1n : 1n;
  const body = cleaned.replace(/^-/, "");
  if (!/^\d+(\.\d{0,3})?$/.test(body)) {
    throw new Error(`Invalid quantity: "${s}"`);
  }
  const [whole = "0", frac = ""] = body.split(".");
  return sign * (BigInt(whole) * 1000n + BigInt((frac + "000").slice(0, 3)));
}

/**
 * Manual stock adjustment — updates Item.qtyOnHandMilli AND posts a proper journal entry
 * so the inventory asset on the balance sheet stays in sync with the on-hand count.
 *
 * Required: itemId, newQty (decimal), reason, offsetAccountId (COGS/EXPENSE — usually
 * "Inventory Adjustments" / shrinkage). Optional: adjustmentDate.
 *
 * Posting:
 *   Write-up   (delta > 0):  Dr Inventory Asset / Cr Offset (negative shrink, e.g. found stock)
 *   Write-down (delta < 0):  Dr Offset / Cr Inventory Asset (shrinkage, breakage, donation)
 *   Zero delta: no JE, redirect with no-op.
 *
 * Valuation: |deltaMilli| / 1000 * unitCostCents (rounded). Updates avg cost is NOT touched.
 */
export async function adjustItemStockAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) throw new Error("Forbidden");

  const itemId = formData.get("itemId") as string;
  const newQtyRaw = (formData.get("newQty") as string) || "";
  const reason = ((formData.get("reason") as string) || "").trim();
  const offsetAccountId = (formData.get("offsetAccountId") as string) || "";
  const dateStr = (formData.get("adjustmentDate") as string) || "";

  if (!itemId) throw new Error("Missing itemId.");
  if (!reason) throw new Error("Reason is required.");
  if (!offsetAccountId) throw new Error("Offset account is required.");

  const newQtyMilli = parseQtyMilli(newQtyRaw);
  if (newQtyMilli < 0n) {
    throw new Error("New quantity cannot be negative.");
  }

  const item = await db.item.findFirst({
    where: { id: itemId, tenantId: auth.tenant.id, type: "INVENTORY" },
    select: {
      id: true,
      entityId: true,
      name: true,
      qtyOnHandMilli: true,
      unitCostCents: true,
      inventoryAccountId: true,
    },
  });
  if (!item) throw new Error("Inventory item not found.");
  if (!item.inventoryAccountId) {
    throw new Error("This item has no inventory asset account set. Edit the item first.");
  }

  // Confirm offset account belongs to same tenant + entity, and is a P&L-side account
  const offset = await db.account.findFirst({
    where: { id: offsetAccountId, tenantId: auth.tenant.id, entityId: item.entityId },
    select: { id: true, type: true, code: true, name: true },
  });
  if (!offset) throw new Error("Offset account not found in this entity.");
  if (!["COGS", "EXPENSE", "OTHER_EXPENSE", "OTHER_INCOME"].includes(offset.type)) {
    throw new Error("Offset account must be a COGS, Expense, or Other Income/Expense account.");
  }

  const deltaMilli = newQtyMilli - item.qtyOnHandMilli;
  if (deltaMilli === 0n) {
    revalidatePath(`/${tenantSlug}/items`);
    redirect(`/${tenantSlug}/items?adj=nochange`);
  }

  // Value at current unit cost. |delta| * unitCost / 1000, rounded half-up.
  const absDelta = deltaMilli < 0n ? -deltaMilli : deltaMilli;
  const valueCents = (absDelta * item.unitCostCents + 500n) / 1000n;

  if (valueCents <= 0n) {
    // Qty changed but unitCost is zero — still update qty, skip JE.
    await db.item.update({
      where: { id: itemId },
      data: { qtyOnHandMilli: newQtyMilli },
    });
    revalidatePath(`/${tenantSlug}/items`);
    redirect(`/${tenantSlug}/items?adj=qty-only`);
  }

  const entryDate = dateStr ? new Date(dateStr + "T12:00:00Z") : new Date();
  const description = `Stock adjustment: ${item.name} — ${reason}`;

  // Write-up: Dr Inventory / Cr Offset
  // Write-down: Dr Offset / Cr Inventory
  const isWriteUp = deltaMilli > 0n;
  const lines = isWriteUp
    ? [
        {
          accountId: item.inventoryAccountId,
          debitCents: valueCents,
          creditCents: 0n,
          memo: `Increase ${item.name}`,
        },
        {
          accountId: offset.id,
          debitCents: 0n,
          creditCents: valueCents,
          memo: reason,
        },
      ]
    : [
        {
          accountId: offset.id,
          debitCents: valueCents,
          creditCents: 0n,
          memo: reason,
        },
        {
          accountId: item.inventoryAccountId,
          debitCents: 0n,
          creditCents: valueCents,
          memo: `Decrease ${item.name}`,
        },
      ];

  await db.$transaction(async (tx) => {
    await postJournalEntry(
      {
        tenantId: auth.tenant.id,
        entityId: item.entityId,
        entryDate,
        description,
        memo: reason,
        source: "ADJUSTMENT",
        sourceRefId: `item:${item.id}`,
        lines,
      },
      { postedByUserId: auth.user.id, client: tx },
    );

    await tx.item.update({
      where: { id: item.id },
      data: { qtyOnHandMilli: newQtyMilli },
    });
  });

  revalidatePath(`/${tenantSlug}/items`);
  redirect(`/${tenantSlug}/items?adj=ok`);
}
