/**
 * Class / Project P&L report.
 *
 * Aggregates revenue and expense across journal lines, grouped by classTag
 * (the dimensional tag set per Lock B6). Lines without a classTag fall under
 * "(Unclassified)".
 *
 * Output: a matrix of { classTag -> { account -> amount } } plus column totals
 * and a grand total row. Suitable for project profitability reporting.
 */

import type { PrismaClient } from "@prisma/client";
import { db as defaultDb } from "@/lib/db";
import { normalBalanceSign } from "@/lib/accounting/ledger";

const UNCLASSIFIED = "(Unclassified)";

export type ClassPnlAccountRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: "REVENUE" | "EXPENSE";
  amountsByClass: Record<string, bigint>; // classTag -> signed amount (revenue positive, expense positive)
  total: bigint;
};

export type ClassPnlReport = {
  entity: { id: string; name: string; baseCurrency: string };
  periodStart: Date;
  periodEnd: Date;
  classes: string[]; // all class tags found, sorted, Unclassified last
  revenueRows: ClassPnlAccountRow[];
  expenseRows: ClassPnlAccountRow[];
  totalsByClass: {
    revenueByClass: Record<string, bigint>;
    expenseByClass: Record<string, bigint>;
    netByClass: Record<string, bigint>;
  };
  grandTotals: { revenue: bigint; expense: bigint; net: bigint };
};

export async function getClassPnlReport(opts: {
  tenantId: string;
  entityId: string;
  periodStart: Date;
  periodEnd: Date;
  client?: PrismaClient;
}): Promise<ClassPnlReport> {
  const client = opts.client ?? defaultDb;

  const entity = await client.entity.findFirst({
    where: { id: opts.entityId, tenantId: opts.tenantId },
    select: { id: true, name: true, baseCurrency: true },
  });
  if (!entity) throw new Error("Entity not found");

  // Pull all P&L lines posted in the window for this entity.
  const lines = await client.journalLine.findMany({
    where: {
      tenantId: opts.tenantId,
      journalEntry: {
        tenantId: opts.tenantId,
        entityId: opts.entityId,
        status: "POSTED",
        entryDate: { gte: opts.periodStart, lte: opts.periodEnd },
      },
      account: { type: { in: ["REVENUE", "EXPENSE"] } },
    },
    select: {
      debitCents: true,
      creditCents: true,
      classTag: true,
      account: {
        select: { id: true, code: true, name: true, type: true },
      },
    },
  });

  // Collect unique classes (Unclassified always present)
  const classSet = new Set<string>();
  classSet.add(UNCLASSIFIED);
  for (const l of lines) {
    if (l.classTag && l.classTag.trim()) classSet.add(l.classTag.trim());
  }
  const classes = Array.from(classSet).sort((a, b) => {
    if (a === UNCLASSIFIED) return 1;
    if (b === UNCLASSIFIED) return -1;
    return a.localeCompare(b);
  });

  // Bucket per account, per class
  type AccBucket = {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: "REVENUE" | "EXPENSE";
    amountsByClass: Map<string, bigint>;
  };
  const byAccount = new Map<string, AccBucket>();

  for (const l of lines) {
    const accId = l.account.id;
    let bucket = byAccount.get(accId);
    if (!bucket) {
      bucket = {
        accountId: accId,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountType: l.account.type as "REVENUE" | "EXPENSE",
        amountsByClass: new Map(),
      };
      byAccount.set(accId, bucket);
    }
    const cls = (l.classTag && l.classTag.trim()) || UNCLASSIFIED;
    // Revenue: credits increase balance; debit reduces it.
    //   signed = (credit - debit) for a REVENUE account → positive
    // Expense: debits increase balance.
    //   signed = (debit - credit) for an EXPENSE account → positive
    const sign = normalBalanceSign(l.account.type);
    const delta =
      sign === -1
        ? l.creditCents - l.debitCents // REVENUE
        : l.debitCents - l.creditCents; // EXPENSE
    bucket.amountsByClass.set(cls, (bucket.amountsByClass.get(cls) ?? 0n) + delta);
  }

  const revenueRows: ClassPnlAccountRow[] = [];
  const expenseRows: ClassPnlAccountRow[] = [];
  for (const bucket of byAccount.values()) {
    const amountsByClass: Record<string, bigint> = {};
    let total = 0n;
    for (const cls of classes) {
      const v = bucket.amountsByClass.get(cls) ?? 0n;
      amountsByClass[cls] = v;
      total += v;
    }
    const row: ClassPnlAccountRow = {
      accountId: bucket.accountId,
      accountCode: bucket.accountCode,
      accountName: bucket.accountName,
      accountType: bucket.accountType,
      amountsByClass,
      total,
    };
    if (bucket.accountType === "REVENUE") revenueRows.push(row);
    else expenseRows.push(row);
  }
  revenueRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  expenseRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const revenueByClass: Record<string, bigint> = {};
  const expenseByClass: Record<string, bigint> = {};
  const netByClass: Record<string, bigint> = {};
  for (const cls of classes) {
    revenueByClass[cls] = revenueRows.reduce((s, r) => s + (r.amountsByClass[cls] ?? 0n), 0n);
    expenseByClass[cls] = expenseRows.reduce((s, r) => s + (r.amountsByClass[cls] ?? 0n), 0n);
    netByClass[cls] = (revenueByClass[cls] ?? 0n) - (expenseByClass[cls] ?? 0n);
  }

  const grandRev = Object.values(revenueByClass).reduce((s, v) => s + v, 0n);
  const grandExp = Object.values(expenseByClass).reduce((s, v) => s + v, 0n);

  return {
    entity,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    classes,
    revenueRows,
    expenseRows,
    totalsByClass: { revenueByClass, expenseByClass, netByClass },
    grandTotals: { revenue: grandRev, expense: grandExp, net: grandRev - grandExp },
  };
}
