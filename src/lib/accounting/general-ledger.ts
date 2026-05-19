/**
 * General Ledger — per-account history with running balance.
 *
 * For each account, returns:
 *   - opening balance (sum of all activity before the start date, in natural sign)
 *   - every JournalLine within [start, end] with running balance
 *   - closing balance
 *
 * Balance signs are in NATURAL form (debit-normal accounts positive when
 * debits exceed credits; credit-normal accounts positive when credits exceed
 * debits). A negative running balance signals an unusual condition.
 */
import type { AccountType, EntrySource, EntryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { normalBalanceSign } from "./ledger";

export interface GLLine {
  lineId: string;
  entryId: string;
  entryNumber: number;
  entryDate: Date;
  description: string | null;
  memo: string | null;
  source: EntrySource;
  status: EntryStatus;
  debitCents: bigint;
  creditCents: bigint;
  /** Running balance in natural sign after applying this line. */
  runningBalance: bigint;
  /** This line's per-line memo (overrides entry memo when present). */
  lineMemo: string | null;
}

export interface GLAccount {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: bigint;
  closingBalance: bigint;
  totalDebits: bigint;
  totalCredits: bigint;
  lines: GLLine[];
}

export async function buildGeneralLedger(args: {
  tenantId: string;
  entityId: string;
  accountId: string;
  startDate: Date;
  endDate: Date;
}): Promise<GLAccount | null> {
  const { tenantId, entityId, accountId, startDate, endDate } = args;

  const account = await db.account.findFirst({
    where: { id: accountId, tenantId, entityId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!account) return null;

  const sign = normalBalanceSign(account.type);

  // Opening balance: sum of all lines before startDate (POSTED only)
  const priorAgg = await db.journalLine.aggregate({
    where: {
      tenantId,
      accountId,
      journalEntry: {
        entityId,
        status: "POSTED",
        entryDate: { lt: startDate },
      },
    },
    _sum: { debitCents: true, creditCents: true },
  });
  const priorDebit = priorAgg._sum.debitCents ?? 0n;
  const priorCredit = priorAgg._sum.creditCents ?? 0n;
  const openingNatural =
    sign === 1 ? priorDebit - priorCredit : priorCredit - priorDebit;

  // Range lines (POSTED only)
  const rangeLines = await db.journalLine.findMany({
    where: {
      tenantId,
      accountId,
      journalEntry: {
        entityId,
        status: "POSTED",
        entryDate: { gte: startDate, lte: endDate },
      },
    },
    include: {
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
          description: true,
          memo: true,
          source: true,
          status: true,
        },
      },
    },
    orderBy: [
      { journalEntry: { entryDate: "asc" } },
      { journalEntry: { entryNumber: "asc" } },
      { lineNumber: "asc" },
    ],
  });

  let running = openingNatural;
  let totalDebits = 0n;
  let totalCredits = 0n;
  const lines: GLLine[] = [];
  for (const l of rangeLines) {
    const delta =
      sign === 1 ? l.debitCents - l.creditCents : l.creditCents - l.debitCents;
    running += delta;
    totalDebits += l.debitCents;
    totalCredits += l.creditCents;
    lines.push({
      lineId: l.id,
      entryId: l.journalEntry.id,
      entryNumber: l.journalEntry.entryNumber,
      entryDate: l.journalEntry.entryDate,
      description: l.journalEntry.description,
      memo: l.journalEntry.memo,
      source: l.journalEntry.source,
      status: l.journalEntry.status,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      runningBalance: running,
      lineMemo: l.memo,
    });
  }

  return {
    accountId: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    openingBalance: openingNatural,
    closingBalance: running,
    totalDebits,
    totalCredits,
    lines,
  };
}
