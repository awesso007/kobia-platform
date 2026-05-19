/// 1099-MISC computation: allocate vendor payments across IRS boxes by account assignment.
///
/// Strategy: For each 1099-MISC vendor, sum BillPayment.amountCents in the tax year,
/// allocate each payment to bill lines proportionally by line amount, then group the
/// per-line allocation by Account.misc1099Box (1=Rents, 2=Royalties, 3=Other Income,
/// 6=Medical, 14=Gross Atty Fees). Lines whose account has no misc1099Box land in
/// "Unassigned" — flagged for the user to fix.

import { db } from "@/lib/db";

// IRS 2026 thresholds per box (in cents).
// Box 2 Royalties triggers at $10; all other boxes at $600.
export const MISC_BOX_THRESHOLDS: Record<number, bigint> = {
  1: 60000n,   // Rents — $600
  2: 1000n,    // Royalties — $10
  3: 60000n,   // Other Income — $600
  6: 60000n,   // Medical & Health Care — $600
  14: 0n,      // Gross proceeds to attorney — $0 (always reportable)
};

export const MISC_BOX_LABELS: Record<number, string> = {
  1: "Rents",
  2: "Royalties",
  3: "Other Income",
  6: "Medical / Health Care",
  14: "Gross Atty Fees",
};

export type MiscBoxKey = 1 | 2 | 3 | 6 | 14;
export const MISC_BOXES: MiscBoxKey[] = [1, 2, 3, 6, 14];

export type Vendor1099MiscRow = {
  vendorId: string;
  vendorName: string;
  email: string | null;
  taxId: string | null;
  paidYTD: bigint;
  byBox: Record<number, bigint>;
  unassigned: bigint;
  paymentCount: number;
  reportableBoxes: number[]; // boxes where paidYTD >= threshold
  missingW9: boolean;
};

export async function get1099MiscRows(args: {
  tenantId: string;
  entityId: string;
  year: number;
}): Promise<Vendor1099MiscRow[]> {
  const yearStart = new Date(Date.UTC(args.year, 0, 1));
  const yearEnd = new Date(Date.UTC(args.year + 1, 0, 1));

  const vendors = await db.vendor.findMany({
    where: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      is1099MiscVendor: true,
    },
    include: {
      bills: {
        select: {
          id: true,
          totalCents: true,
          lines: {
            select: {
              amountCents: true,
              account: { select: { misc1099Box: true } },
            },
          },
          payments: {
            where: { paymentDate: { gte: yearStart, lt: yearEnd } },
            select: { amountCents: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return vendors.map((v) => {
    const byBox: Record<number, bigint> = { 1: 0n, 2: 0n, 3: 0n, 6: 0n, 14: 0n };
    let unassigned = 0n;
    let paidYTD = 0n;
    let paymentCount = 0;

    for (const bill of v.bills) {
      const paidInYear = bill.payments.reduce((s, p) => s + p.amountCents, 0n);
      paymentCount += bill.payments.length;
      if (paidInYear === 0n) continue;
      paidYTD += paidInYear;

      // Allocate paidInYear across this bill's lines proportionally by amountCents.
      const totalLineCents = bill.lines.reduce((s, l) => s + l.amountCents, 0n);
      if (totalLineCents === 0n) {
        unassigned += paidInYear;
        continue;
      }
      // Track remainder to make sure no cents are lost to integer truncation.
      let allocated = 0n;
      for (let i = 0; i < bill.lines.length; i++) {
        const line = bill.lines[i]!;
        const isLast = i === bill.lines.length - 1;
        const portion = isLast
          ? paidInYear - allocated
          : (paidInYear * line.amountCents) / totalLineCents;
        allocated += portion;
        const box = line.account.misc1099Box;
        if (box && box in byBox) {
          byBox[box] = (byBox[box] ?? 0n) + portion;
        } else {
          unassigned += portion;
        }
      }
    }

    const reportableBoxes = MISC_BOXES.filter(
      (b) => (byBox[b] ?? 0n) >= (MISC_BOX_THRESHOLDS[b] ?? 60000n),
    );

    return {
      vendorId: v.id,
      vendorName: v.name,
      email: v.email,
      taxId: v.taxId,
      paidYTD,
      byBox,
      unassigned,
      paymentCount,
      reportableBoxes,
      missingW9: !v.taxId,
    };
  });
}

export function totalsByBox(rows: Vendor1099MiscRow[]): Record<number, bigint> {
  const totals: Record<number, bigint> = { 1: 0n, 2: 0n, 3: 0n, 6: 0n, 14: 0n };
  for (const r of rows) {
    for (const b of MISC_BOXES) {
      totals[b] = (totals[b] ?? 0n) + (r.byBox[b] ?? 0n);
    }
  }
  return totals;
}
