/**
 * Budget vs Actuals — compute monthly actuals from POSTED journal lines
 * and compare to a budget's monthly amounts.
 */
import { db } from "@/lib/db";
import { normalBalanceSign } from "./ledger";

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;
export type MonthKey = (typeof MONTHS)[number];

export type BudgetVsActualRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  monthly: Array<{
    month: MonthKey;
    budget: bigint;
    actual: bigint;
    variance: bigint; // actual - budget
  }>;
  ytdBudget: bigint;
  ytdActual: bigint;
  ytdVariance: bigint;
};

export async function buildBudgetVsActual(args: {
  tenantId: string;
  entityId: string;
  budgetId: string;
}): Promise<{
  rows: BudgetVsActualRow[];
  fiscalYear: number;
  totals: { ytdBudget: bigint; ytdActual: bigint; ytdVariance: bigint };
}> {
  const budget = await db.budget.findUnique({
    where: { id: args.budgetId },
    include: {
      lines: { include: { account: true } },
    },
  });
  if (!budget) throw new Error("Budget not found");

  const fy = budget.fiscalYear;
  const startOfYear = new Date(Date.UTC(fy, 0, 1));
  const endOfYear = new Date(Date.UTC(fy + 1, 0, 1));

  // Pull all posted lines for this entity in this fiscal year, grouped by account+month
  const lines = await db.journalLine.findMany({
    where: {
      tenantId: args.tenantId,
      journalEntry: {
        entityId: args.entityId,
        status: "POSTED",
        entryDate: { gte: startOfYear, lt: endOfYear },
      },
      accountId: { in: budget.lines.map((l) => l.accountId) },
    },
    select: {
      accountId: true,
      debitCents: true,
      creditCents: true,
      journalEntry: { select: { entryDate: true } },
    },
  });

  // accountId -> month index -> signed cents
  const actualsMap = new Map<string, bigint[]>();
  for (const line of lines) {
    const monthIdx = line.journalEntry.entryDate.getUTCMonth();
    if (!actualsMap.has(line.accountId)) {
      actualsMap.set(line.accountId, Array(12).fill(0n));
    }
    const arr = actualsMap.get(line.accountId);
    if (!arr) continue;
    // Signed amount: debit - credit
    arr[monthIdx] = (arr[monthIdx] ?? 0n) + line.debitCents - line.creditCents;
  }

  const rows: BudgetVsActualRow[] = budget.lines.map((bl) => {
    const sign = normalBalanceSign(bl.account.type);
    const actualsArr = actualsMap.get(bl.accountId) ?? Array(12).fill(0n);
    const monthly = MONTHS.map((m, i) => {
      const budgetCents = bl[m] as bigint;
      // Actual in natural sign of account (expense debits become positive)
      const actualCents = (actualsArr[i] ?? 0n) * BigInt(sign);
      return {
        month: m,
        budget: budgetCents,
        actual: actualCents,
        variance: actualCents - budgetCents,
      };
    });
    const ytdBudget = monthly.reduce((s, m) => s + m.budget, 0n);
    const ytdActual = monthly.reduce((s, m) => s + m.actual, 0n);
    return {
      accountId: bl.accountId,
      code: bl.account.code,
      name: bl.account.name,
      type: bl.account.type,
      monthly,
      ytdBudget,
      ytdActual,
      ytdVariance: ytdActual - ytdBudget,
    };
  });

  rows.sort((a, b) => a.code.localeCompare(b.code));

  const totals = rows.reduce(
    (acc, r) => ({
      ytdBudget: acc.ytdBudget + r.ytdBudget,
      ytdActual: acc.ytdActual + r.ytdActual,
      ytdVariance: acc.ytdVariance + r.ytdVariance,
    }),
    { ytdBudget: 0n, ytdActual: 0n, ytdVariance: 0n }
  );

  return { rows, fiscalYear: fy, totals };
}
