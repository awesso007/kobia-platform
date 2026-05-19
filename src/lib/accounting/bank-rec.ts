/**
 * Bank reconciliation utilities.
 *
 * Concepts:
 * - BankAccount = real-world account linked 1:1 to a GL account (cash or credit card).
 * - BankTransaction = signed line imported from a CSV/feed. +amount = inflow, -amount = outflow.
 * - Lifecycle: UNMATCHED → MATCHED (tied to existing JE) | CATEGORIZED (new JE created) | IGNORED.
 *               Then → CLEARED when included in a completed ReconciliationSession.
 * - BankRule = description-substring auto-categorization shortcut.
 */
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { postJournalEntry } from "@/lib/accounting/ledger";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export type CsvRow = {
  postedDate: Date;
  description: string;
  amountCents: bigint; // signed
  balanceAfterCents?: bigint;
  rawData?: unknown;
};

/** Stable dedup hash: SHA-1(YYYY-MM-DD|signed-amount|normalized-description). */
export function computeDedupHash(
  postedDate: Date,
  amountCents: bigint,
  description: string
): string {
  const day = postedDate.toISOString().slice(0, 10);
  const desc = description.trim().toLowerCase().replace(/\s+/g, " ");
  const h = createHash("sha1");
  h.update(`${day}|${amountCents.toString()}|${desc}`);
  return h.digest("hex");
}

/**
 * Parse a CSV string into typed CsvRow objects.
 * Supports two common formats:
 *   1. Single signed amount column:  Date, Description, Amount
 *   2. Separate debit/credit columns: Date, Description, Debit, Credit  (Debit = outflow)
 * Date format: YYYY-MM-DD or M/D/YYYY.
 * Amount can have $, commas, parens for negatives.
 */
export function parseBankCsv(csv: string): CsvRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  // Split a CSV line, respecting quoted fields
  const splitCsv = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === "," && !inQuote) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitCsv(lines[0]!).map((h) => h.toLowerCase());
  const findCol = (...names: string[]): number => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const dateCol = findCol("date");
  const descCol = findCol("description", "memo", "details", "payee");
  const amountCol = findCol("amount");
  const debitCol = findCol("debit", "withdrawal");
  const creditCol = findCol("credit", "deposit");
  const balanceCol = findCol("balance");

  if (dateCol < 0 || descCol < 0) {
    throw new Error(
      "CSV must include 'Date' and 'Description' columns. Found: " + header.join(", ")
    );
  }
  if (amountCol < 0 && (debitCol < 0 || creditCol < 0)) {
    throw new Error("CSV must include 'Amount' OR both 'Debit' and 'Credit' columns.");
  }

  const parseAmount = (s: string): bigint => {
    const cleaned = s.trim().replace(/[$,\s]/g, "");
    if (!cleaned) return 0n;
    const neg = /^\(.*\)$/.test(cleaned) || cleaned.startsWith("-");
    const body = cleaned.replace(/^[-(]|\)$/g, "");
    if (!/^\d*(\.\d+)?$/.test(body)) {
      throw new Error(`Invalid amount: "${s}"`);
    }
    const [whole = "0", frac = ""] = body.split(".");
    const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2) || "0");
    return neg ? -cents : cents;
  };

  const parseDate = (s: string): Date => {
    const t = s.trim();
    // ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t);
    // M/D/YYYY or MM/DD/YYYY
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      let yy = parseInt(m[3]!, 10);
      if (yy < 100) yy += 2000;
      const mm = parseInt(m[1]!, 10);
      const dd = parseInt(m[2]!, 10);
      return new Date(Date.UTC(yy, mm - 1, dd));
    }
    throw new Error(`Unrecognized date format: "${s}"`);
  };

  const rows: CsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsv(lines[li]!);
    if (cells.length < 2) continue;
    const postedDate = parseDate(cells[dateCol] ?? "");
    const description = (cells[descCol] ?? "").replace(/^"|"$/g, "").trim();
    let amountCents: bigint;
    if (amountCol >= 0) {
      amountCents = parseAmount(cells[amountCol] ?? "0");
    } else {
      const debit = parseAmount(cells[debitCol] ?? "0");
      const credit = parseAmount(cells[creditCol] ?? "0");
      amountCents = credit - debit; // credit (deposit) = positive
    }
    const balanceAfterCents =
      balanceCol >= 0 && cells[balanceCol] ? parseAmount(cells[balanceCol]!) : undefined;
    if (!description) continue;
    rows.push({
      postedDate,
      description,
      amountCents,
      balanceAfterCents,
      rawData: { csvRow: cells },
    });
  }
  return rows;
}

/** Bulk-import CSV rows. Skips duplicates by (bankAccountId, dedupHash). */
export async function importCsvRows(args: {
  tenantId: string;
  bankAccountId: string;
  rows: CsvRow[];
}): Promise<{ imported: number; skipped: number; total: number }> {
  const { tenantId, bankAccountId, rows } = args;
  let imported = 0;
  let skipped = 0;

  // Use createMany with skipDuplicates for speed
  const data: Prisma.BankTransactionCreateManyInput[] = rows.map((r) => ({
    tenantId,
    bankAccountId,
    postedDate: r.postedDate,
    description: r.description,
    amountCents: r.amountCents,
    balanceAfterCents: r.balanceAfterCents,
    dedupHash: computeDedupHash(r.postedDate, r.amountCents, r.description),
    source: "CSV_IMPORT",
    rawData: r.rawData as Prisma.InputJsonValue,
    status: "UNMATCHED",
  }));

  const result = await db.bankTransaction.createMany({
    data,
    skipDuplicates: true,
  });
  imported = result.count;
  skipped = rows.length - result.count;
  return { imported, skipped, total: rows.length };
}

// ---------------------------------------------------------------------------
// Match suggestions
// ---------------------------------------------------------------------------

export type MatchCandidate = {
  journalEntryId: string;
  entryNumber: number;
  entryDate: Date;
  description: string | null;
  amountCents: bigint;
  source: string;
  score: number; // 0..1
  reason: string;
};

/**
 * Find JEs that could match a bank txn.
 * Rules:
 *   - Same entity, same sign of impact on the bank's GL account
 *   - Same absolute amount (exact match required)
 *   - Within ±5 days of posted date
 *   - Status POSTED, not yet matched to another bank txn
 * Score = 1.0 if exact-date match, decays by 0.05/day off, plus +0.1 if description shares any word.
 */
export async function findMatchCandidates(
  bankTxnId: string,
  options: { maxResults?: number; daysWindow?: number } = {}
): Promise<MatchCandidate[]> {
  const daysWindow = options.daysWindow ?? 5;
  const maxResults = options.maxResults ?? 5;

  const txn = await db.bankTransaction.findUnique({
    where: { id: bankTxnId },
    include: { bankAccount: true },
  });
  if (!txn) return [];

  const glAccountId = txn.bankAccount.glAccountId;
  const txnAmt = txn.amountCents; // signed: + = money in, - = money out

  // For the GL bank account: money-in means the bank account was DEBITED,
  // money-out means the bank account was CREDITED.
  // So we look for JE lines on glAccountId where:
  //   debit = +amount  (inflow)
  //   credit = +|amount|  (outflow)
  const windowStart = new Date(txn.postedDate.getTime() - daysWindow * 86400_000);
  const windowEnd = new Date(txn.postedDate.getTime() + daysWindow * 86400_000);
  const absAmt = txnAmt < 0n ? -txnAmt : txnAmt;

  const candidateLines = await db.journalLine.findMany({
    where: {
      accountId: glAccountId,
      tenantId: txn.tenantId,
      ...(txnAmt > 0n
        ? { debitCents: absAmt, creditCents: 0n }
        : { creditCents: absAmt, debitCents: 0n }),
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: windowStart, lte: windowEnd },
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
        },
      },
    },
    take: 50,
  });

  // Exclude JEs that are already matched to another bank txn
  const alreadyMatched = await db.bankTransaction.findMany({
    where: {
      bankAccountId: txn.bankAccountId,
      matchedJournalEntryId: { in: candidateLines.map((c) => c.journalEntry.id) },
      id: { not: bankTxnId },
    },
    select: { matchedJournalEntryId: true },
  });
  const matchedIds = new Set(alreadyMatched.map((m) => m.matchedJournalEntryId));

  const txnWords = new Set(
    txn.description
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  const candidates: MatchCandidate[] = candidateLines
    .filter((c) => !matchedIds.has(c.journalEntry.id))
    .map((c) => {
      const dayDiff = Math.abs(
        (c.journalEntry.entryDate.getTime() - txn.postedDate.getTime()) / 86400_000
      );
      let score = Math.max(0, 1 - dayDiff * 0.05);
      const joinedDesc = `${c.journalEntry.description ?? ""} ${c.journalEntry.memo ?? ""}`.toLowerCase();
      const hasWord = Array.from(txnWords).some((w) => joinedDesc.includes(w));
      if (hasWord) score = Math.min(1, score + 0.1);
      const reason = `${
        dayDiff === 0 ? "Same day" : `${Math.round(dayDiff)}d off`
      }${hasWord ? " · description match" : ""}`;
      return {
        journalEntryId: c.journalEntry.id,
        entryNumber: c.journalEntry.entryNumber,
        entryDate: c.journalEntry.entryDate,
        description: c.journalEntry.description ?? c.journalEntry.memo ?? null,
        amountCents: absAmt,
        source: c.journalEntry.source,
        score,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  // De-dup by JE id (a single JE may have multiple lines on the bank account)
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.journalEntryId)) return false;
    seen.add(c.journalEntryId);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Actions: match, categorize, ignore
// ---------------------------------------------------------------------------

/** Tie a bank txn to an existing posted JE. */
export async function matchToJournalEntry(args: {
  bankTxnId: string;
  journalEntryId: string;
  userId?: string;
}) {
  const { bankTxnId, journalEntryId, userId } = args;

  const txn = await db.bankTransaction.findUnique({
    where: { id: bankTxnId },
    include: { bankAccount: true },
  });
  if (!txn) throw new Error("Bank transaction not found.");
  if (txn.status !== "UNMATCHED") {
    throw new Error(`Cannot match: status is ${txn.status}.`);
  }

  // Sanity: the JE must touch the bank's GL account with matching sign+amount
  const je = await db.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: true },
  });
  if (!je) throw new Error("Journal entry not found.");
  if (je.tenantId !== txn.tenantId) throw new Error("Cross-tenant match blocked.");

  const absAmt = txn.amountCents < 0n ? -txn.amountCents : txn.amountCents;
  const matchingLine = je.lines.find(
    (l) =>
      l.accountId === txn.bankAccount.glAccountId &&
      (txn.amountCents > 0n
        ? l.debitCents === absAmt && l.creditCents === 0n
        : l.creditCents === absAmt && l.debitCents === 0n)
  );
  if (!matchingLine) {
    throw new Error(
      `JE #${je.entryNumber} does not contain a matching line on the bank's GL account.`
    );
  }

  return db.bankTransaction.update({
    where: { id: bankTxnId },
    data: {
      status: "MATCHED",
      matchedJournalEntryId: journalEntryId,
      matchedAt: new Date(),
      matchedByUserId: userId,
    },
  });
}

/** Unmatch (set back to UNMATCHED). */
export async function unmatchBankTxn(bankTxnId: string) {
  const txn = await db.bankTransaction.findUnique({ where: { id: bankTxnId } });
  if (!txn) throw new Error("Bank transaction not found.");
  if (txn.status === "CLEARED") {
    throw new Error("Cannot unmatch a cleared transaction. Reopen the reconciliation first.");
  }
  return db.bankTransaction.update({
    where: { id: bankTxnId },
    data: {
      status: "UNMATCHED",
      matchedJournalEntryId: null,
      matchedAt: null,
      matchedByUserId: null,
      categorizedJournalEntryId: null,
      categorizedAt: null,
      categorizedByUserId: null,
      appliedRuleId: null,
    },
  });
}

/**
 * Categorize a bank txn = create a new JE.
 * Inflow:  Dr bank account / Cr offset account
 * Outflow: Dr offset account / Cr bank account
 */
export async function categorizeBankTxn(args: {
  bankTxnId: string;
  offsetAccountId: string;
  memo?: string;
  contactRefType?: string;
  contactRefId?: string;
  userId?: string;
  appliedRuleId?: string;
}) {
  const { bankTxnId, offsetAccountId, memo, contactRefType, contactRefId, userId, appliedRuleId } =
    args;

  const txn = await db.bankTransaction.findUnique({
    where: { id: bankTxnId },
    include: { bankAccount: { include: { glAccount: true } } },
  });
  if (!txn) throw new Error("Bank transaction not found.");
  if (txn.status !== "UNMATCHED") {
    throw new Error(`Cannot categorize: status is ${txn.status}.`);
  }

  const offset = await db.account.findFirst({
    where: { id: offsetAccountId, tenantId: txn.tenantId },
  });
  if (!offset) throw new Error("Offset account not found.");

  const isInflow = txn.amountCents > 0n;
  const absAmt = isInflow ? txn.amountCents : -txn.amountCents;
  if (absAmt === 0n) throw new Error("Zero-amount transaction cannot be categorized.");

  const finalMemo = memo ?? txn.description;

  const entry = await postJournalEntry(
    {
      tenantId: txn.tenantId,
      entityId: txn.bankAccount.entityId,
      entryDate: txn.postedDate,
      description: finalMemo,
      memo: `Bank txn · ${txn.bankAccount.name}`,
      source: "BANK_FEED",
      sourceRefId: txn.id,
      lines: isInflow
        ? [
            {
              accountId: txn.bankAccount.glAccountId,
              debitCents: absAmt,
              creditCents: 0n,
              memo: finalMemo,
            },
            {
              accountId: offsetAccountId,
              debitCents: 0n,
              creditCents: absAmt,
              memo: finalMemo,
              contactRefType,
              contactRefId,
            },
          ]
        : [
            {
              accountId: offsetAccountId,
              debitCents: absAmt,
              creditCents: 0n,
              memo: finalMemo,
              contactRefType,
              contactRefId,
            },
            {
              accountId: txn.bankAccount.glAccountId,
              debitCents: 0n,
              creditCents: absAmt,
              memo: finalMemo,
            },
          ],
    },
    { postedByUserId: userId }
  );

  return db.bankTransaction.update({
    where: { id: bankTxnId },
    data: {
      status: "CATEGORIZED",
      categorizedJournalEntryId: entry.id,
      categorizedAt: new Date(),
      categorizedByUserId: userId,
      appliedRuleId: appliedRuleId ?? null,
    },
  });
}

/** Mark a transaction as ignored (e.g. transfer between own accounts). */
export async function ignoreBankTxn(bankTxnId: string) {
  const txn = await db.bankTransaction.findUnique({ where: { id: bankTxnId } });
  if (!txn) throw new Error("Bank transaction not found.");
  if (txn.status === "CLEARED") {
    throw new Error("Cannot ignore a cleared transaction.");
  }
  return db.bankTransaction.update({
    where: { id: bankTxnId },
    data: { status: "IGNORED" },
  });
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Apply all active rules to a set of UNMATCHED transactions.
 * Returns count of txns categorized.
 */
export async function applyRulesToUnmatched(args: {
  tenantId: string;
  bankAccountId: string;
  userId?: string;
}): Promise<{ categorized: number; rulesApplied: Map<string, number> }> {
  const { tenantId, bankAccountId, userId } = args;

  const rules = await db.bankRule.findMany({
    where: { tenantId, bankAccountId, isActive: true },
    orderBy: { priority: "asc" },
  });
  if (rules.length === 0) {
    return { categorized: 0, rulesApplied: new Map() };
  }

  const unmatched = await db.bankTransaction.findMany({
    where: { tenantId, bankAccountId, status: "UNMATCHED" },
  });

  let categorized = 0;
  const rulesApplied = new Map<string, number>();

  for (const txn of unmatched) {
    const isInflow = txn.amountCents > 0n;
    const lc = txn.description.toLowerCase();
    const rule = rules.find((r) => {
      if (isInflow && !r.appliesToInflow) return false;
      if (!isInflow && !r.appliesToOutflow) return false;
      return lc.includes(r.descriptionContains.toLowerCase());
    });
    if (!rule) continue;
    try {
      await categorizeBankTxn({
        bankTxnId: txn.id,
        offsetAccountId: rule.offsetAccountId,
        memo: rule.memoTemplate ?? txn.description,
        contactRefType: rule.contactRefType ?? undefined,
        contactRefId: rule.contactRefId ?? undefined,
        userId,
        appliedRuleId: rule.id,
      });
      categorized++;
      rulesApplied.set(rule.id, (rulesApplied.get(rule.id) ?? 0) + 1);
      await db.bankRule.update({
        where: { id: rule.id },
        data: { appliedCount: { increment: 1 }, lastAppliedAt: new Date() },
      });
    } catch (err) {
      console.error(`Rule ${rule.id} failed on txn ${txn.id}:`, err);
    }
  }

  return { categorized, rulesApplied };
}

// ---------------------------------------------------------------------------
// Reconciliation sessions
// ---------------------------------------------------------------------------

/** Computed status for a reconciliation in progress. */
export type ReconStatus = {
  statementStartBalanceCents: bigint;
  statementEndBalanceCents: bigint;
  expectedChange: bigint; // end - start
  clearedTotalCents: bigint; // sum of selected txns
  drift: bigint; // expectedChange - clearedTotalCents (should be 0 to complete)
  unmatchedCount: number;
  selectedCount: number;
};

/**
 * Compute the current drift for a session: how far off the cleared total is
 * from the statement's beginning→ending change.
 */
export async function computeReconciliationStatus(
  sessionId: string
): Promise<ReconStatus> {
  const session = await db.reconciliationSession.findUnique({
    where: { id: sessionId },
    include: {
      transactions: { select: { amountCents: true } },
      bankAccount: true,
    },
  });
  if (!session) throw new Error("Reconciliation session not found.");

  const clearedTotalCents = session.transactions.reduce(
    (s, t) => s + t.amountCents,
    0n
  );
  const expectedChange =
    session.statementEndBalanceCents - session.statementStartBalanceCents;

  // Count remaining unmatched-or-uncleared txns in the statement window
  const eligible = await db.bankTransaction.count({
    where: {
      bankAccountId: session.bankAccountId,
      postedDate: {
        gte: session.statementStartDate,
        lte: session.statementEndDate,
      },
      status: { in: ["MATCHED", "CATEGORIZED"] },
      reconciliationId: null,
    },
  });

  return {
    statementStartBalanceCents: session.statementStartBalanceCents,
    statementEndBalanceCents: session.statementEndBalanceCents,
    expectedChange,
    clearedTotalCents,
    drift: expectedChange - clearedTotalCents,
    unmatchedCount: eligible,
    selectedCount: session.transactions.length,
  };
}

/** Add or remove a txn from the in-progress reconciliation. */
export async function toggleTransactionInSession(args: {
  sessionId: string;
  bankTxnId: string;
  include: boolean;
}) {
  const { sessionId, bankTxnId, include } = args;
  const session = await db.reconciliationSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new Error("Reconciliation session not found.");
  if (session.status !== "IN_PROGRESS") {
    throw new Error("Reconciliation is no longer in progress.");
  }

  const txn = await db.bankTransaction.findUnique({ where: { id: bankTxnId } });
  if (!txn) throw new Error("Bank transaction not found.");
  if (txn.bankAccountId !== session.bankAccountId) {
    throw new Error("Transaction does not belong to this bank account.");
  }
  if (!["MATCHED", "CATEGORIZED"].includes(txn.status) && include) {
    throw new Error("Only matched or categorized transactions can be cleared.");
  }

  return db.bankTransaction.update({
    where: { id: bankTxnId },
    data: {
      reconciliationId: include ? sessionId : null,
    },
  });
}

/** Complete a reconciliation. Drift must be 0. Sets cleared txns → CLEARED. */
export async function completeReconciliation(args: {
  sessionId: string;
  userId?: string;
}) {
  const { sessionId, userId } = args;
  const status = await computeReconciliationStatus(sessionId);
  if (status.drift !== 0n) {
    throw new Error(
      `Cannot complete: drift is ${status.drift.toString()} cents. Cleared total must equal statement change.`
    );
  }
  if (status.selectedCount === 0) {
    throw new Error("Cannot complete a reconciliation with no cleared transactions.");
  }

  const now = new Date();
  await db.$transaction([
    db.bankTransaction.updateMany({
      where: { reconciliationId: sessionId },
      data: { status: "CLEARED", clearedAt: now },
    }),
    db.reconciliationSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        completedByUserId: userId,
        clearedTotalCents: status.clearedTotalCents,
      },
    }),
  ]);
  return { ok: true, clearedTotalCents: status.clearedTotalCents.toString() };
}
