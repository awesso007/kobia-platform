/**
 * Cash Flow Statement — Indirect Method.
 *
 * Computes the three sections (Operating, Investing, Financing) from JE activity
 * in a date window, plus a Direct Method validation that traces actual cash
 * movement through bank/cash accounts to cross-check the indirect computation.
 *
 * INDIRECT METHOD:
 *   Net Income
 *   + Non-cash expenses (depreciation, amortization)
 *   ± Changes in operating working capital
 *       AR ↑ = cash use (revenue earned but not collected)
 *       AR ↓ = cash source
 *       AP ↑ = cash source (expense booked but not paid)
 *       AP ↓ = cash use
 *       Inventory ↑ = cash use
 *       ...
 *   = Cash from Operating
 *
 *   ± Changes in investing accounts (fixed assets, investments)
 *   = Cash from Investing
 *
 *   ± Changes in financing accounts (long-term debt, equity, distributions)
 *   = Cash from Financing
 *
 *   Total Δ Cash = Operating + Investing + Financing
 *
 * DIRECT METHOD (validation):
 *   Sum all JE lines hitting cash accounts in the window.
 *   Should equal Total Δ Cash from indirect method (within rounding).
 */
import { db } from "@/lib/db";
import type { Account, AccountType } from "@prisma/client";

export type CashFlowRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  /** Movement signed as cash effect (+ = inflow, − = outflow). */
  cashEffectCents: bigint;
  /** Underlying balance change (signed by debit−credit). */
  balanceChangeCents: bigint;
};

export type CashFlowSection = {
  label: string;
  rows: CashFlowRow[];
  total: bigint;
};

export type CashFlowReport = {
  startDate: Date;
  endDate: Date;
  /** Opening cash balance at startDate. */
  openingCashCents: bigint;
  /** Closing cash balance at endDate. */
  closingCashCents: bigint;
  /** The list of accounts treated as "cash" (typically subtype=Bank). */
  cashAccountIds: string[];

  netIncomeCents: bigint;
  nonCashAdjustments: CashFlowSection;
  workingCapital: CashFlowSection;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;

  /** Net change in cash per indirect method. */
  netCashChangeCents: bigint;
  /** Net change in cash per direct trace through cash accounts. */
  directTraceCents: bigint;
  /** Should be 0 for a healthy report. */
  reconciliationDriftCents: bigint;
};

/** Classify a balance-sheet account into a cash-flow section. */
function classifyAccount(
  acc: Pick<Account, "type" | "subtype" | "code">,
  isCash: boolean
): "CASH" | "WC" | "INVESTING" | "FINANCING" | "PL" | "RETAINED" {
  if (isCash) return "CASH";

  // P&L accounts roll into Net Income directly
  if (
    acc.type === "REVENUE" ||
    acc.type === "OTHER_INCOME" ||
    acc.type === "EXPENSE" ||
    acc.type === "COGS" ||
    acc.type === "OTHER_EXPENSE"
  ) {
    return "PL";
  }

  const sub = (acc.subtype ?? "").toLowerCase();

  // Retained Earnings is handled implicitly via Net Income; skip from financing
  if (sub.includes("retained")) return "RETAINED";

  // Investing: fixed assets, investments, intangibles
  if (acc.type === "ASSET") {
    if (
      sub.includes("fixed asset") ||
      sub.includes("investment") ||
      sub.includes("intangible") ||
      sub.includes("long term asset")
    ) {
      return "INVESTING";
    }
    // Default: other ASSET (AR, Inventory, Prepaid, Other Current) → Working Capital
    return "WC";
  }

  if (acc.type === "LIABILITY") {
    if (sub.includes("long term") || sub.includes("long-term") || sub.includes("note payable")) {
      return "FINANCING";
    }
    // Default: AP, Credit Card, Accrued, Tax, Payroll → Working Capital
    return "WC";
  }

  if (acc.type === "EQUITY") {
    // Owner contributions, draws, common stock → Financing
    return "FINANCING";
  }

  // Fallback
  return "WC";
}

/**
 * Compute net change in an account's balance over [start, end] from JEs.
 * Returns sum(debit − credit) for all POSTED/REVERSED lines in the window.
 */
async function netActivityInWindow(
  accountId: string,
  start: Date,
  end: Date
): Promise<bigint> {
  const result = await db.journalLine.aggregate({
    where: {
      accountId,
      journalEntry: {
        status: { in: ["POSTED", "REVERSED"] },
        entryDate: { gte: start, lte: end },
      },
    },
    _sum: { debitCents: true, creditCents: true },
  });
  const dr = result._sum.debitCents ?? 0n;
  const cr = result._sum.creditCents ?? 0n;
  return dr - cr;
}

/**
 * Compute the cash-flow statement for an entity over a date window.
 */
export async function computeCashFlow(args: {
  entityId: string;
  tenantId: string;
  startDate: Date;
  endDate: Date;
}): Promise<CashFlowReport> {
  const { entityId, tenantId, startDate, endDate } = args;

  // Day before start, used for opening cash balance calculation
  const dayBeforeStart = new Date(startDate);
  dayBeforeStart.setUTCDate(dayBeforeStart.getUTCDate() - 1);
  dayBeforeStart.setUTCHours(23, 59, 59, 999);

  // 1. Identify cash accounts: subtype="Bank" OR linked to a BankAccount
  const bankAccountLinks = await db.bankAccount.findMany({
    where: { tenantId, entityId },
    select: { glAccountId: true },
  });
  const linkedIds = new Set(bankAccountLinks.map((b) => b.glAccountId));

  const allAccounts = await db.account.findMany({
    where: { tenantId, entityId },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  const cashAccountIds = allAccounts
    .filter(
      (a) =>
        a.type === "ASSET" &&
        ((a.subtype ?? "").toLowerCase() === "bank" || linkedIds.has(a.id))
    )
    .map((a) => a.id);

  // 2. Opening cash balance = sum of all activity before startDate on cash accounts
  let openingCashCents = 0n;
  for (const cashId of cashAccountIds) {
    const result = await db.journalLine.aggregate({
      where: {
        accountId: cashId,
        journalEntry: {
          status: { in: ["POSTED", "REVERSED"] },
          entryDate: { lte: dayBeforeStart },
        },
      },
      _sum: { debitCents: true, creditCents: true },
    });
    const dr = result._sum.debitCents ?? 0n;
    const cr = result._sum.creditCents ?? 0n;
    openingCashCents += dr - cr;
  }

  // 3. Closing cash balance = opening + activity in window
  let directTraceCents = 0n;
  for (const cashId of cashAccountIds) {
    directTraceCents += await netActivityInWindow(cashId, startDate, endDate);
  }
  const closingCashCents = openingCashCents + directTraceCents;

  // 4. Compute Net Income (sum activity on P&L accounts, signed for cash effect)
  //    For revenues (normal credit balance), net activity is negative; flip sign for income.
  //    For expenses (normal debit balance), net activity is positive; flip sign for income.
  //    Net Income = Revenue − Expenses
  let netIncomeCents = 0n;
  for (const acc of allAccounts) {
    if (acc.type === "REVENUE" || acc.type === "OTHER_INCOME") {
      const net = await netActivityInWindow(acc.id, startDate, endDate);
      // Revenue: credit balance, so net is negative (cr > dr). Income = -net.
      netIncomeCents += -net;
    } else if (
      acc.type === "EXPENSE" ||
      acc.type === "COGS" ||
      acc.type === "OTHER_EXPENSE"
    ) {
      const net = await netActivityInWindow(acc.id, startDate, endDate);
      // Expense: debit balance, net is positive. Subtract from income.
      netIncomeCents -= net;
    }
  }

  // 5. Walk balance-sheet accounts and classify activity
  const nonCashRows: CashFlowRow[] = [];
  const wcRows: CashFlowRow[] = [];
  const investingRows: CashFlowRow[] = [];
  const financingRows: CashFlowRow[] = [];

  for (const acc of allAccounts) {
    const isCash = cashAccountIds.includes(acc.id);

    // Non-cash add-back: Depreciation expense
    const subLow = (acc.subtype ?? "").toLowerCase();
    if (
      (acc.type === "EXPENSE" || acc.type === "OTHER_EXPENSE") &&
      (subLow.includes("depreciation") || subLow.includes("amortization"))
    ) {
      const net = await netActivityInWindow(acc.id, startDate, endDate);
      // Expense is dr-balance; add it back to operating cash flow
      if (net !== 0n) {
        nonCashRows.push({
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          subtype: acc.subtype,
          balanceChangeCents: net,
          cashEffectCents: net, // adding back the expense
        });
      }
      continue;
    }

    const classification = classifyAccount(acc, isCash);
    if (classification === "CASH" || classification === "PL" || classification === "RETAINED") {
      continue;
    }

    const balanceChange = await netActivityInWindow(acc.id, startDate, endDate);
    if (balanceChange === 0n) continue;

    // Cash effect rules:
    //   ASSET balance ↑ (dr > cr, balanceChange > 0): cash use → cashEffect = -balanceChange
    //   ASSET balance ↓: cash source → cashEffect = -balanceChange (still negate)
    //   LIABILITY balance ↑ (cr > dr, balanceChange < 0): cash source → cashEffect = -balanceChange
    //   LIABILITY balance ↓ (dr > cr, balanceChange > 0): cash use → cashEffect = -balanceChange
    //   EQUITY same as LIABILITY (credit-normal)
    // Net: cashEffect = -balanceChange for ASSET; -balanceChange for LIABILITY/EQUITY.
    // (debit-normal accounts: dr↑=cash use; credit-normal: cr↑=cash source. Both: cashEffect = -balanceChange)
    const cashEffect = -balanceChange;

    const row: CashFlowRow = {
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      subtype: acc.subtype,
      balanceChangeCents: balanceChange,
      cashEffectCents: cashEffect,
    };

    if (classification === "WC") wcRows.push(row);
    else if (classification === "INVESTING") investingRows.push(row);
    else if (classification === "FINANCING") financingRows.push(row);
  }

  const sumRows = (rows: CashFlowRow[]) =>
    rows.reduce((s, r) => s + r.cashEffectCents, 0n);

  const nonCashAdjustments: CashFlowSection = {
    label: "Non-cash adjustments",
    rows: nonCashRows,
    total: sumRows(nonCashRows),
  };
  const workingCapital: CashFlowSection = {
    label: "Changes in working capital",
    rows: wcRows,
    total: sumRows(wcRows),
  };
  const operating: CashFlowSection = {
    label: "Cash from operating activities",
    rows: [],
    total: netIncomeCents + nonCashAdjustments.total + workingCapital.total,
  };
  const investing: CashFlowSection = {
    label: "Cash from investing activities",
    rows: investingRows,
    total: sumRows(investingRows),
  };
  const financing: CashFlowSection = {
    label: "Cash from financing activities",
    rows: financingRows,
    total: sumRows(financingRows),
  };

  const netCashChangeCents = operating.total + investing.total + financing.total;
  const reconciliationDriftCents = netCashChangeCents - directTraceCents;

  return {
    startDate,
    endDate,
    openingCashCents,
    closingCashCents,
    cashAccountIds,
    netIncomeCents,
    nonCashAdjustments,
    workingCapital,
    operating,
    investing,
    financing,
    netCashChangeCents,
    directTraceCents,
    reconciliationDriftCents,
  };
}
