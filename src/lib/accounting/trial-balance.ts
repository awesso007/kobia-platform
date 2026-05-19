/**
 * Trial Balance — sum of all posted JournalLine debits/credits per account
 * as of a date. Result groups by account; each account has a `debitCents`
 * and `creditCents` totals plus a derived `netBalance` in natural sign.
 *
 * Total debits MUST equal total credits — that's the whole point of the
 * trial balance. If they don't, something is wrong with the ledger.
 */
import type { AccountType } from "@prisma/client";
import { db } from "@/lib/db";
import { normalBalanceSign } from "./ledger";

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitCents: bigint; // total debits posted to this account
  creditCents: bigint; // total credits posted to this account
  /**
   * Display balance in the natural (positive) sign for this account type.
   * For debit-normal accounts: debitCents - creditCents
   * For credit-normal accounts: creditCents - debitCents
   * A negative value indicates an unusual balance (e.g. a credit balance
   * on an asset, which usually signals a posting error or a refund).
   */
  netBalance: bigint;
  /** Which column the natural balance goes in: "DR" or "CR". */
  naturalSide: "DR" | "CR";
}

export interface TrialBalance {
  entityId: string;
  asOfDate: Date;
  rows: TrialBalanceRow[];
  totalDebits: bigint;
  totalCredits: bigint;
  balanced: boolean;
  difference: bigint; // debits - credits, should be 0
}

/**
 * Build a trial balance for a given entity, up to and including asOfDate.
 *
 * Only includes accounts with non-zero activity through the date. Pass
 * `includeZero: true` to include all accounts.
 */
export async function buildTrialBalance(args: {
  tenantId: string;
  entityId: string;
  asOfDate: Date;
  includeZero?: boolean;
}): Promise<TrialBalance> {
  const { tenantId, entityId, asOfDate, includeZero = false } = args;

  // Pull all journal lines whose parent entry is on/before asOfDate.
  // Group totals by accountId.
  const lines = await db.journalLine.findMany({
    where: {
      tenantId,
      journalEntry: {
        entityId,
        entryDate: { lte: asOfDate },
      },
    },
    select: {
      accountId: true,
      debitCents: true,
      creditCents: true,
    },
  });

  const accounts = await db.account.findMany({
    where: { tenantId, entityId },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  });

  const totalsByAccount = new Map<string, { debit: bigint; credit: bigint }>();
  for (const l of lines) {
    const cur = totalsByAccount.get(l.accountId) ?? { debit: 0n, credit: 0n };
    cur.debit += l.debitCents;
    cur.credit += l.creditCents;
    totalsByAccount.set(l.accountId, cur);
  }

  const rows: TrialBalanceRow[] = [];
  let totalDebits = 0n;
  let totalCredits = 0n;

  for (const acc of accounts) {
    const t = totalsByAccount.get(acc.id) ?? { debit: 0n, credit: 0n };
    if (!includeZero && t.debit === 0n && t.credit === 0n) continue;
    const sign = normalBalanceSign(acc.type);
    const net = sign === 1 ? t.debit - t.credit : t.credit - t.debit;
    rows.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      debitCents: t.debit,
      creditCents: t.credit,
      netBalance: net,
      naturalSide: sign === 1 ? "DR" : "CR",
    });
    totalDebits += t.debit;
    totalCredits += t.credit;
  }

  return {
    entityId,
    asOfDate,
    rows,
    totalDebits,
    totalCredits,
    balanced: totalDebits === totalCredits,
    difference: totalDebits - totalCredits,
  };
}

/**
 * Build a "balance-style" trial balance — each account shows its natural-side
 * balance in either the DR or CR column (not gross debits/credits).
 * This is the format most accountants prefer for review.
 */
export function toBalanceStyleRows(tb: TrialBalance): Array<{
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  drBalance: bigint;
  crBalance: bigint;
}> {
  return tb.rows.map((r) => {
    // If the natural balance is positive, put it in its natural column.
    // If it went negative (unusual), flip it to the opposite column as a positive.
    if (r.netBalance >= 0n) {
      return {
        accountId: r.accountId,
        code: r.code,
        name: r.name,
        type: r.type,
        drBalance: r.naturalSide === "DR" ? r.netBalance : 0n,
        crBalance: r.naturalSide === "CR" ? r.netBalance : 0n,
      };
    }
    // Unusual: flip sign and put in the opposite column
    const abs = -r.netBalance;
    return {
      accountId: r.accountId,
      code: r.code,
      name: r.name,
      type: r.type,
      drBalance: r.naturalSide === "CR" ? abs : 0n,
      crBalance: r.naturalSide === "DR" ? abs : 0n,
    };
  });
}
