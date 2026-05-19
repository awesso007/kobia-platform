/// Inventory movements: per-item history of quantity changes derived from invoice sales
/// and manual adjustments (via JournalEntry source=MANUAL with itemId tag — future enhancement).
///
/// For now, movements come from posted InvoiceLine rows linked to INVENTORY items.

import { db } from "@/lib/db";

export type InventoryMovement = {
  date: Date;
  type: "SALE" | "ADJUSTMENT" | "PURCHASE";
  refType: "INVOICE" | "JOURNAL" | "BILL";
  refId: string;
  refLabel: string;
  qtyChangeMilli: bigint; // signed: negative for sale, positive for purchase
  unitCostCents: bigint;
  costDeltaCents: bigint; // signed
  runningQtyMilli: bigint;
  runningValueCents: bigint;
};

export type ItemMovementReport = {
  itemId: string;
  itemName: string;
  sku: string | null;
  currentQtyMilli: bigint;
  currentValueCents: bigint;
  unitCostCents: bigint;
  movements: InventoryMovement[];
  totalSoldMilli: bigint;
  totalSalesCents: bigint;
  totalCogsCents: bigint;
};

export async function getItemMovementReport(args: {
  tenantId: string;
  entityId: string;
  itemId: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<ItemMovementReport | null> {
  const item = await db.item.findFirst({
    where: {
      id: args.itemId,
      tenantId: args.tenantId,
      entityId: args.entityId,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      type: true,
      qtyOnHandMilli: true,
      unitCostCents: true,
    },
  });
  if (!item) return null;

  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (args.startDate) dateFilter.gte = args.startDate;
  if (args.endDate) dateFilter.lt = args.endDate;

  // Pull all invoice lines for this item where the invoice is posted.
  const invoiceLines = await db.invoiceLine.findMany({
    where: {
      tenantId: args.tenantId,
      itemId: args.itemId,
      invoice: {
        status: { in: ["OPEN", "PARTIAL", "PAID"] },
        ...(Object.keys(dateFilter).length > 0 ? { issueDate: dateFilter } : {}),
      },
    },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: { invoice: { issueDate: "asc" } },
  });

  const movements: InventoryMovement[] = [];
  // Start from earliest qty (qty before any movements in the window).
  // Approximation: use current qtyOnHandMilli and roll backward, then forward.
  // For simplicity in MVP: show movements forward starting from 0 baseline if no filter.
  let runningQty = 0n;
  let runningValue = 0n;
  let totalSoldMilli = 0n;
  let totalSalesCents = 0n;
  let totalCogsCents = 0n;

  for (const line of invoiceLines) {
    const qtyDelta = -line.quantityMilli; // sale = decrease
    const cogsDelta = -((line.quantityMilli * item.unitCostCents) / 1000n);
    runningQty += qtyDelta;
    runningValue += cogsDelta;
    totalSoldMilli += line.quantityMilli;
    totalSalesCents += line.amountCents;
    totalCogsCents += -cogsDelta;

    movements.push({
      date: line.invoice.issueDate,
      type: "SALE",
      refType: "INVOICE",
      refId: line.invoice.id,
      refLabel: `INV-${String(line.invoice.invoiceNumber).padStart(4, "0")} · ${line.invoice.customer.name}`,
      qtyChangeMilli: qtyDelta,
      unitCostCents: item.unitCostCents,
      costDeltaCents: cogsDelta,
      runningQtyMilli: runningQty,
      runningValueCents: runningValue,
    });
  }

  return {
    itemId: item.id,
    itemName: item.name,
    sku: item.sku,
    currentQtyMilli: item.qtyOnHandMilli,
    currentValueCents: (item.qtyOnHandMilli * item.unitCostCents) / 1000n,
    unitCostCents: item.unitCostCents,
    movements: movements.reverse(), // most recent first for display
    totalSoldMilli,
    totalSalesCents,
    totalCogsCents,
  };
}

export async function listInventoryItemsWithStats(args: {
  tenantId: string;
  entityId: string;
}): Promise<
  Array<{
    id: string;
    name: string;
    sku: string | null;
    qtyOnHandMilli: bigint;
    unitCostCents: bigint;
    valueCents: bigint;
    lifetimeSoldMilli: bigint;
    lifetimeSalesCents: bigint;
  }>
> {
  const items = await db.item.findMany({
    where: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      type: "INVENTORY",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      qtyOnHandMilli: true,
      unitCostCents: true,
      invoiceLines: {
        where: {
          invoice: { status: { in: ["OPEN", "PARTIAL", "PAID"] } },
        },
        select: { quantityMilli: true, amountCents: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return items.map((i) => {
    const lifetimeSoldMilli = i.invoiceLines.reduce(
      (s, l) => s + l.quantityMilli,
      0n,
    );
    const lifetimeSalesCents = i.invoiceLines.reduce(
      (s, l) => s + l.amountCents,
      0n,
    );
    return {
      id: i.id,
      name: i.name,
      sku: i.sku,
      qtyOnHandMilli: i.qtyOnHandMilli,
      unitCostCents: i.unitCostCents,
      valueCents: (i.qtyOnHandMilli * i.unitCostCents) / 1000n,
      lifetimeSoldMilli,
      lifetimeSalesCents,
    };
  });
}

export function formatQtyMilli(q: bigint): string {
  const negative = q < 0n;
  const abs = negative ? -q : q;
  const whole = abs / 1000n;
  const frac = abs % 1000n;
  const sign = negative ? "-" : "";
  if (frac === 0n) return `${sign}${whole.toString()}`;
  const fracStr = frac.toString().padStart(3, "0").replace(/0+$/, "");
  return `${sign}${whole.toString()}.${fracStr}`;
}
