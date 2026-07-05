/*
 * Inventory stock engine (Sprint 20, server-only). Every function that changes
 * on-hand quantity runs inside an interactive Prisma transaction so StockItem
 * quantities stay consistent with the StockMovement ledger: the movement row and
 * the running StockItem.quantity are always written together.
 *
 * StockMovement.quantity is stored SIGNED (see inventory-utils). Directional
 * types receive a positive magnitude and the sign is derived; ADJUSTMENT carries
 * its own signed delta.
 *
 * Low-stock detection: when a movement lowers on-hand to at or below the
 * StockItem threshold, we dispatch STOCK_LOW and notify inventory managers,
 * deduped via lastLowStockNotifiedAt so we do not spam on every small change.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, Prisma } from "@/lib/db/generated/tenant";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { notifyOn } from "@/lib/notifications/notify";
import { signForMovementType, type MovementType } from "./inventory-utils";

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

export type MovementInput = {
  productId: string;
  warehouseId: string;
  type: MovementType;
  /** Positive magnitude for directional types; signed delta for ADJUSTMENT. */
  quantity: number;
  unitCostCents?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  createdById?: string | null;
};

type LowStockEvent = {
  stockItemId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  lowStockThreshold: number;
};

/** Signed delta a movement applies to on-hand quantity. */
function signedDelta(type: MovementType, quantity: number): number {
  return type === "ADJUSTMENT" ? quantity : signForMovementType(type) * Math.abs(quantity);
}

/**
 * Apply one movement inside an existing transaction: upsert the StockItem, write
 * the ledger row, and update the running quantity. Returns a LowStockEvent when
 * this movement lowered on-hand to at or below the threshold (caller dispatches
 * after commit).
 */
async function applyMovementTx(tx: Tx, input: MovementInput): Promise<LowStockEvent | null> {
  const delta = signedDelta(input.type, input.quantity);
  const existing = await tx.stockItem.findUnique({
    where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
  });

  const prevQty = existing?.quantity ?? 0;
  const newQty = prevQty + delta;
  const threshold = existing?.lowStockThreshold ?? 10;

  const stockItem = existing
    ? await tx.stockItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      })
    : await tx.stockItem.create({
        data: { productId: input.productId, warehouseId: input.warehouseId, quantity: newQty },
      });

  await tx.stockMovement.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: delta,
      unitCostCents: input.unitCostCents ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });

  if (delta < 0 && newQty <= threshold) {
    return {
      stockItemId: stockItem.id,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: newQty,
      lowStockThreshold: threshold,
    };
  }
  return null;
}

/** Notify inventory managers and dispatch STOCK_LOW. Never throws. */
async function fireLowStock(db: Db, events: LowStockEvent[]): Promise<void> {
  for (const ev of events) {
    try {
      const [product, warehouse] = await Promise.all([
        db.product.findUnique({ where: { id: ev.productId }, select: { name: true, sku: true } }),
        db.warehouse.findUnique({ where: { id: ev.warehouseId }, select: { name: true } }),
      ]);
      const productName = product?.name ?? ev.productId;
      const warehouseName = warehouse?.name ?? ev.warehouseId;

      await dispatchAutomation(
        {
          type: "STOCK_LOW",
          entityType: "STOCK_ITEM",
          entityId: ev.stockItemId,
          record: {
            id: ev.stockItemId,
            productId: ev.productId,
            warehouseId: ev.warehouseId,
            productName,
            sku: product?.sku ?? null,
            warehouseName,
            quantity: ev.quantity,
            lowStockThreshold: ev.lowStockThreshold,
          },
        },
        db,
      );

      const managers = await db.membership.findMany({
        where: { status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MEMBER"] } },
        select: { clerkUserId: true },
      });
      for (const m of managers) {
        await notifyOn(db, m.clerkUserId, {
          type: "SYSTEM",
          title: `Low stock: ${productName}`,
          body: `${productName} at ${warehouseName} is down to ${ev.quantity} (threshold ${ev.lowStockThreshold}).`,
          linkUrl: "/app/inventory/stock",
        });
      }

      await db.stockItem.update({ where: { id: ev.stockItemId }, data: { lastLowStockNotifiedAt: new Date() } });
    } catch (err) {
      console.error("[inventory] fireLowStock failed", err);
    }
  }
}

/** Record a signed inventory adjustment for a single product/warehouse. */
export async function adjustStock(
  db: Db,
  input: { productId: string; warehouseId: string; delta: number; note?: string | null; createdById?: string | null },
): Promise<void> {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new Error("Adjustment delta must be a non-zero integer.");
  const low = await db.$transaction((tx) =>
    applyMovementTx(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: "ADJUSTMENT",
      quantity: input.delta,
      referenceType: "MANUAL",
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    }),
  );
  if (low) await fireLowStock(db, [low]);
}

/** Generic movement entry point (used by seeds and manual receipts/shipments). */
export async function applyMovement(db: Db, input: MovementInput): Promise<void> {
  const low = await db.$transaction((tx) => applyMovementTx(tx, input));
  if (low) await fireLowStock(db, [low]);
}

/** DRAFT/PENDING transfer -> IN_TRANSIT; records a TRANSFER_OUT per line. */
export async function transferSend(db: Db, transferId: string, userId?: string | null): Promise<void> {
  const lows = await db.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
    if (!transfer) throw new Error("Transfer not found.");
    if (transfer.status !== "DRAFT" && transfer.status !== "PENDING") throw new Error(`Cannot send a transfer in status ${transfer.status}.`);
    const events: LowStockEvent[] = [];
    for (const item of transfer.items) {
      const low = await applyMovementTx(tx, {
        productId: item.productId,
        warehouseId: transfer.fromWarehouseId,
        type: "TRANSFER_OUT",
        quantity: item.quantity,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        createdById: userId ?? null,
      });
      if (low) events.push(low);
    }
    await tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "IN_TRANSIT", sentAt: new Date() } });
    return events;
  });
  await fireLowStock(db, lows);
}

/** IN_TRANSIT transfer -> RECEIVED; records a TRANSFER_IN per line and fires TRANSFER_RECEIVED. */
export async function transferReceive(db: Db, transferId: string, userId?: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: { items: true } });
    if (!transfer) throw new Error("Transfer not found.");
    if (transfer.status !== "IN_TRANSIT") throw new Error(`Cannot receive a transfer in status ${transfer.status}.`);
    for (const item of transfer.items) {
      await applyMovementTx(tx, {
        productId: item.productId,
        warehouseId: transfer.toWarehouseId,
        type: "TRANSFER_IN",
        quantity: item.quantity,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        createdById: userId ?? null,
      });
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { receivedQuantity: item.quantity } });
    }
    await tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
  });

  try {
    const transfer = await db.stockTransfer.findUnique({ where: { id: transferId } });
    await dispatchAutomation(
      { type: "TRANSFER_RECEIVED", entityType: "STOCK_TRANSFER", entityId: transferId, record: (transfer ?? { id: transferId }) as Record<string, unknown> },
      db,
    );
  } catch (err) {
    console.error("[inventory] transferReceive dispatch failed", err);
  }
}

/** Receive PO lines: RECEIPT movements, bump receivedQuantity, transition PARTIAL/RECEIVED. */
export async function poReceive(
  db: Db,
  poId: string,
  lines: { itemId: string; receivedQuantity: number }[],
  userId?: string | null,
): Promise<{ status: string }> {
  const status = await db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
    if (!po) throw new Error("Purchase order not found.");
    if (po.status === "CANCELED" || po.status === "RECEIVED") throw new Error(`Cannot receive a PO in status ${po.status}.`);

    const byId = new Map(po.items.map((i) => [i.id, i]));
    for (const line of lines) {
      const item = byId.get(line.itemId);
      if (!item) continue;
      const receiveQty = Math.trunc(line.receivedQuantity);
      if (receiveQty <= 0) continue;
      const remaining = item.quantity - item.receivedQuantity;
      const applied = Math.min(receiveQty, Math.max(0, remaining));
      if (applied <= 0) continue;

      await applyMovementTx(tx, {
        productId: item.productId,
        warehouseId: po.warehouseId,
        type: "RECEIPT",
        quantity: applied,
        unitCostCents: item.unitCostCents,
        referenceType: "PURCHASE",
        referenceId: po.id,
        createdById: userId ?? null,
      });
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQuantity: item.receivedQuantity + applied } });
    }

    const refreshed = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
    const allReceived = (refreshed?.items ?? []).every((i) => i.receivedQuantity >= i.quantity);
    const anyReceived = (refreshed?.items ?? []).some((i) => i.receivedQuantity > 0);
    const nextStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : po.status;
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: nextStatus, receivedAt: allReceived ? new Date() : po.receivedAt },
    });
    return nextStatus;
  });

  if (status === "RECEIVED") {
    try {
      const po = await db.purchaseOrder.findUnique({ where: { id: poId } });
      await dispatchAutomation(
        { type: "PURCHASE_ORDER_RECEIVED", entityType: "PURCHASE_ORDER", entityId: poId, record: (po ?? { id: poId }) as Record<string, unknown> },
        db,
      );
    } catch (err) {
      console.error("[inventory] poReceive dispatch failed", err);
    }
  }
  return { status };
}
