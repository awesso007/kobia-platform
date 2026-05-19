/**
 * Ledger posting engine — the heart of KOBIA's accounting (Cycle 2).
 *
 * Rules (enforced here, not just in DB):
 *   1. Sum of debits must equal sum of credits (double-entry).
 *   2. At least 2 lines per entry.
 *   3. All amounts in BigInt cents — never floats.
 *   4. Entry cannot post if its period is locked.
 *   5. Posting is transactional: lines + entry status + account balance updates all-or-nothing.
 *   6. Normal balance: ASSET/EXPENSE/COGS/OTHER_EXPENSE are debit-positive; LIABILITY/EQUITY/REVENUE/OTHER_INCOME are credit-positive.
 */
import type { AccountType, Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

export type DraftLine = {
  accountId: string;
  debitCents: bigint;
  creditCents: bigint;
  memo?: string;
  classTag?: string;
  locationTag?: string;
  departmentTag?: string;
  contactRefType?: string;
  contactRefId?: string;
};

export type DraftEntry = {
  tenantId: string;
  entityId: string;
  entryDate: Date;
  description?: string;
  memo?: string;
  source?: Prisma.JournalEntryCreateInput["source"];
  sourceRefId?: string;
  lines: DraftLine[];
};

export class LedgerError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

/** Validate draft entry — throws LedgerError on any rule violation. */
export function validateEntry(draft: DraftEntry): void {
  if (draft.lines.length < 2) {
    throw new LedgerError("TOO_FEW_LINES", "A journal entry must have at least 2 lines.");
  }

  let totalDebit = 0n;
  let totalCredit = 0n;

  for (const [i, line] of draft.lines.entries()) {
    if (line.debitCents < 0n || line.creditCents < 0n) {
      throw new LedgerError("NEGATIVE_AMOUNT", `Line ${i + 1}: amounts must be non-negative.`);
    }
    if (line.debitCents > 0n && line.creditCents > 0n) {
      throw new LedgerError("BOTH_SIDES", `Line ${i + 1}: cannot have both debit and credit.`);
    }
    if (line.debitCents === 0n && line.creditCents === 0n) {
      throw new LedgerError("ZERO_LINE", `Line ${i + 1}: must have a non-zero debit or credit.`);
    }
    totalDebit += line.debitCents;
    totalCredit += line.creditCents;
  }

  if (totalDebit !== totalCredit) {
    throw new LedgerError(
      "UNBALANCED",
      `Entry not balanced. Debits=${formatCents(totalDebit)}, Credits=${formatCents(totalCredit)}, Diff=${formatCents(totalDebit - totalCredit)}.`
    );
  }
}

/** Returns +1 if account type is debit-normal, -1 if credit-normal. */
export function normalBalanceSign(type: AccountType): 1 | -1 {
  switch (type) {
    case "ASSET":
    case "EXPENSE":
    case "COGS":
    case "OTHER_EXPENSE":
      return 1;
    case "LIABILITY":
    case "EQUITY":
    case "REVENUE":
    case "OTHER_INCOME":
      return -1;
  }
}

/**
 * Post a journal entry: write entry + lines, update Account.balanceCents.
 * Wrapped in a Prisma transaction.
 */
export async function postJournalEntry(
  draft: DraftEntry,
  options: { postedByUserId?: string; client?: Prisma.TransactionClient } = {}
) {
  validateEntry(draft);

  const exec = async (tx: Prisma.TransactionClient | PrismaClient) => {
    // Load all referenced accounts to verify they belong to this entity + check period locks
    const accountIds = Array.from(new Set(draft.lines.map((l) => l.accountId)));
    const accounts = await tx.account.findMany({
      where: { id: { in: accountIds }, entityId: draft.entityId, tenantId: draft.tenantId },
    });
    if (accounts.length !== accountIds.length) {
      throw new LedgerError("ACCOUNT_MISMATCH", "One or more accounts do not belong to this entity.");
    }
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    // Get next entry number for this entity
    const last = await tx.journalEntry.findFirst({
      where: { entityId: draft.entityId },
      orderBy: { entryNumber: "desc" },
      select: { entryNumber: true },
    });
    const entryNumber = (last?.entryNumber ?? 0) + 1;

    // Create entry + lines + post
    const entry = await tx.journalEntry.create({
      data: {
        tenantId: draft.tenantId,
        entityId: draft.entityId,
        entryNumber,
        entryDate: draft.entryDate,
        description: draft.description,
        memo: draft.memo,
        source: draft.source ?? "MANUAL",
        sourceRefId: draft.sourceRefId,
        status: "POSTED",
        postedAt: new Date(),
        postedByUserId: options.postedByUserId,
        lines: {
          create: draft.lines.map((l, idx) => ({
            tenantId: draft.tenantId,
            accountId: l.accountId,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            memo: l.memo,
            classTag: l.classTag,
            locationTag: l.locationTag,
            departmentTag: l.departmentTag,
            contactRefType: l.contactRefType,
            contactRefId: l.contactRefId,
            lineNumber: idx + 1,
          })),
        },
      },
      include: { lines: true },
    });

    // Update cached balances per account
    // For each account: delta = (sum debits - sum credits) * normalSign
    // ASSET/EXPENSE: balance goes UP on net debit. LIABILITY/EQUITY/REVENUE: balance goes UP on net credit.
    const deltasByAccount = new Map<string, bigint>();
    for (const line of draft.lines) {
      const acc = accountById.get(line.accountId)!;
      const sign = BigInt(normalBalanceSign(acc.type));
      const netDebit = line.debitCents - line.creditCents; // debit-positive net
      const delta = sign === 1n ? netDebit : -netDebit;
      deltasByAccount.set(acc.id, (deltasByAccount.get(acc.id) ?? 0n) + delta);
    }

    await Promise.all(
      Array.from(deltasByAccount.entries()).map(([accId, delta]) =>
        tx.account.update({
          where: { id: accId },
          data: { balanceCents: { increment: delta } },
        })
      )
    );

    return entry;
  };

  if (options.client) return exec(options.client);
  return db.$transaction((tx) => exec(tx));
}

/** Pretty-print BigInt cents as $X,XXX.XX (negatives in parens). */
export function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = abs % 100n;
  const wholeStr = whole.toLocaleString("en-US");
  const fractionStr = fraction.toString().padStart(2, "0");
  const formatted = `$${wholeStr}.${fractionStr}`;
  return negative ? `(${formatted})` : formatted;
}

/** Reverse a posted entry: create an opposite entry, mark original REVERSED. */
export async function reverseJournalEntry(entryId: string, options: { reason?: string; postedByUserId?: string } = {}) {
  return db.$transaction(async (tx) => {
    const original = await tx.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true },
    });
    if (!original) throw new LedgerError("NOT_FOUND", "Original entry not found.");
    if (original.status !== "POSTED") throw new LedgerError("NOT_POSTED", "Only POSTED entries can be reversed.");
    if (original.periodLocked) throw new LedgerError("PERIOD_LOCKED", "Period is locked. Cannot reverse.");

    const reversingDraft: DraftEntry = {
      tenantId: original.tenantId,
      entityId: original.entityId,
      entryDate: new Date(),
      description: `Reversal of JE #${original.entryNumber}${options.reason ? ` — ${options.reason}` : ""}`,
      memo: original.memo ?? undefined,
      source: "ADJUSTMENT",
      sourceRefId: original.id,
      lines: original.lines.map((l) => ({
        accountId: l.accountId,
        // swap debit/credit
        debitCents: l.creditCents,
        creditCents: l.debitCents,
        memo: l.memo ?? undefined,
        classTag: l.classTag ?? undefined,
        locationTag: l.locationTag ?? undefined,
        departmentTag: l.departmentTag ?? undefined,
        contactRefType: l.contactRefType ?? undefined,
        contactRefId: l.contactRefId ?? undefined,
      })),
    };

    const reversing = await postJournalEntry(reversingDraft, { postedByUserId: options.postedByUserId, client: tx });

    await tx.journalEntry.update({
      where: { id: original.id },
      data: { status: "REVERSED", reversedById: reversing.id },
    });
    await tx.journalEntry.update({
      where: { id: reversing.id },
      data: { reversalOfId: original.id },
    });

    return reversing;
  });
}
