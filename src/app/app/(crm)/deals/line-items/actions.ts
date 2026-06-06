"use server";

/*
 * Deal line items (Sprint 10). Line items draw from the Product catalog (or are
 * custom one-off lines with no productId). lineTotalCents is a DB GENERATED
 * column - never write it from app code. After any mutation we recompute the
 * parent Deal.amountCents from the sum of its line totals.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex } from "@/lib/search";

export type LineItemInput = {
  productId?: string | null;
  name: string;
  description?: string | null;
  quantity?: number;
  unitPriceCents: number;
  discountPct?: number;
  taxRatePct?: number;
};

function clampPct(v: number | undefined): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Recompute Deal.amountCents from the sum of its line totals. Returns the new total. */
export async function recomputeDealAmount(dealId: string): Promise<number> {
  const { db } = getTenantDb();
  const agg = await db.dealLineItem.aggregate({ where: { dealId }, _sum: { lineTotalCents: true } });
  const total = agg._sum.lineTotalCents ?? 0;
  await db.deal.update({ where: { id: dealId }, data: { amountCents: BigInt(total) } });
  await dispatchAutomation({ type: "DEAL_AMOUNT_CHANGED", entityType: "DEAL", entityId: dealId, changedFields: ["amountCents"] });
  await reindex(db, "DEAL", dealId);
  return total;
}

export async function createLineItem(dealId: string, input: LineItemInput): Promise<string> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("Line item name is required.");
  const { db } = getTenantDb();
  const max = await db.dealLineItem.aggregate({ where: { dealId }, _max: { sortOrder: true } });
  const item = await db.dealLineItem.create({
    data: {
      dealId,
      productId: input.productId || null,
      name,
      description: input.description?.trim() || null,
      quantity: input.quantity != null && Number.isFinite(input.quantity) ? input.quantity : 1,
      unitPriceCents: Math.round(input.unitPriceCents || 0),
      discountPct: clampPct(input.discountPct),
      taxRatePct: clampPct(input.taxRatePct),
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  await recomputeDealAmount(dealId);
  await auditWrite({ action: "UPDATE", entityType: "DEAL", entityId: dealId, diff: { kind: "DealLineItem", op: "create", name } });
  await dispatchAutomation({ type: "LINE_ITEM_ADDED", entityType: "DEAL", entityId: dealId, changedFields: ["lineItems"] });
  revalidatePath("/app/deals");
  return item.id;
}

export async function updateLineItem(id: string, input: Partial<LineItemInput>): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const existing = await db.dealLineItem.findUniqueOrThrow({ where: { id } });
  const data: Record<string, unknown> = {};
  if (input.productId !== undefined) data.productId = input.productId || null;
  if (input.name !== undefined) { const v = input.name.trim(); if (!v) throw new Error("Line item name is required."); data.name = v; }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.quantity !== undefined && Number.isFinite(input.quantity)) data.quantity = input.quantity;
  if (input.unitPriceCents !== undefined) data.unitPriceCents = Math.round(input.unitPriceCents || 0);
  if (input.discountPct !== undefined) data.discountPct = clampPct(input.discountPct);
  if (input.taxRatePct !== undefined) data.taxRatePct = clampPct(input.taxRatePct);
  await db.dealLineItem.update({ where: { id }, data });
  await recomputeDealAmount(existing.dealId);
  await auditWrite({ action: "UPDATE", entityType: "DEAL", entityId: existing.dealId, diff: { kind: "DealLineItem", op: "update", id } });
  revalidatePath("/app/deals");
}

export async function deleteLineItem(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const existing = await db.dealLineItem.findUniqueOrThrow({ where: { id } });
  await db.dealLineItem.delete({ where: { id } });
  await recomputeDealAmount(existing.dealId);
  await auditWrite({ action: "UPDATE", entityType: "DEAL", entityId: existing.dealId, diff: { kind: "DealLineItem", op: "delete", id } });
  revalidatePath("/app/deals");
}

export async function reorderLineItems(dealId: string, orderedIds: string[]): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.$transaction(
    orderedIds.map((id, i) => db.dealLineItem.update({ where: { id }, data: { sortOrder: i } })),
  );
  await auditWrite({ action: "UPDATE", entityType: "DEAL", entityId: dealId, diff: { kind: "DealLineItem", op: "reorder" } });
  revalidatePath("/app/deals");
}

export type LineItemRow = {
  id: string;
  productId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  discountPct: number;
  taxRatePct: number;
  lineTotalCents: number;
  sortOrder: number;
};

export type ProductPick = { id: string; sku: string; name: string; unitPriceCents: number; taxable: boolean };

/** Load line items + the active product list for the Deal RecordPane Line Items section. */
export async function loadDealLineItems(dealId: string): Promise<{ items: LineItemRow[]; products: ProductPick[] }> {
  const { db } = getTenantDb();
  const [items, products] = await Promise.all([
    db.dealLineItem.findMany({ where: { dealId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.product.findMany({ where: { active: true }, orderBy: [{ name: "asc" }] }),
  ]);
  return {
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      description: i.description,
      quantity: Number(i.quantity),
      unitPriceCents: i.unitPriceCents,
      discountPct: Number(i.discountPct),
      taxRatePct: Number(i.taxRatePct),
      lineTotalCents: i.lineTotalCents,
      sortOrder: i.sortOrder,
    })),
    products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unitPriceCents: p.unitPriceCents, taxable: p.taxable })),
  };
}
