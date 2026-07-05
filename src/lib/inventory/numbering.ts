/*
 * Tenant-scoped document numbering for inventory (Sprint 20). Transfer numbers
 * ("TR-1001") and purchase-order numbers ("PO-1001") increment from the highest
 * existing value. Called inside the create transaction so a burst of creates
 * cannot collide (the unique index on the number column is the final guard).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, Prisma } from "@/lib/db/generated/tenant";

type Db = PrismaClient | Prisma.TransactionClient;

const TRANSFER_PREFIX = "TR-";
const PO_PREFIX = "PO-";
const START = 1001;

function nextFrom(numbers: string[], prefix: string): string {
  let max = START - 1;
  for (const n of numbers) {
    const parsed = Number(n.slice(prefix.length));
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${max + 1}`;
}

export async function nextTransferNumber(db: Db): Promise<string> {
  const rows = await db.stockTransfer.findMany({ select: { transferNumber: true } });
  return nextFrom(rows.map((r) => r.transferNumber), TRANSFER_PREFIX);
}

export async function nextPoNumber(db: Db): Promise<string> {
  const rows = await db.purchaseOrder.findMany({ select: { poNumber: true } });
  return nextFrom(rows.map((r) => r.poNumber), PO_PREFIX);
}
