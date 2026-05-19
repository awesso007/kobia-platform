/**
 * Recurring journal entries engine.
 *
 * A RecurringJournalEntry is a template. When its nextRunDate <= asOf and isActive,
 * we post a real JournalEntry via the ledger engine, then advance nextRunDate by frequency.
 *
 * Frequencies:
 *   WEEKLY    — add 7 days
 *   MONTHLY   — add 1 month (calendar-aware; clamps end-of-month, so Jan 31 → Feb 28/29)
 *   QUARTERLY — add 3 months (same clamping)
 *   ANNUALLY  — add 1 year
 *
 * If endDate is set and nextRunDate moves past endDate, the template auto-deactivates.
 */

import type { RecurringFrequency } from "@prisma/client";
import { db } from "@/lib/db";
import { postJournalEntry, LedgerError } from "@/lib/accounting/ledger";

export type RecurringRunResult = {
  recurringId: string;
  name: string;
  posted: boolean;
  journalEntryId?: string;
  error?: string;
};

export function advanceDate(date: Date, freq: RecurringFrequency): Date {
  const d = new Date(date);
  switch (freq) {
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case "MONTHLY":
      return addMonthsClamped(d, 1);
    case "QUARTERLY":
      return addMonthsClamped(d, 3);
    case "ANNUALLY":
      return addMonthsClamped(d, 12);
  }
}

function addMonthsClamped(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(y, m + months, 1, 12, 0, 0));
  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, daysInTarget));
  return target;
}

/**
 * Run all recurring JEs that are due (nextRunDate <= asOf) for a given entity.
 * Each template posts at most one entry per call. Run again to catch up multi-period
 * gaps (e.g., a monthly template that has been paused for 3 months will need 3 calls).
 */
export async function runDueRecurringJEsForEntity(args: {
  tenantId: string;
  entityId: string;
  asOf?: Date;
  postedByUserId?: string;
}): Promise<RecurringRunResult[]> {
  const asOf = args.asOf ?? new Date();
  const due = await db.recurringJournalEntry.findMany({
    where: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      isActive: true,
      nextRunDate: { lte: asOf },
    },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
    orderBy: { nextRunDate: "asc" },
  });

  const results: RecurringRunResult[] = [];
  for (const r of due) {
    results.push(await runOneRecurringJE(r.id, args.postedByUserId));
  }
  return results;
}

/**
 * Run ONE recurring JE — post a journal entry at its current nextRunDate, then advance.
 * Returns success/failure detail.
 */
export async function runOneRecurringJE(
  recurringId: string,
  postedByUserId?: string,
): Promise<RecurringRunResult> {
  const r = await db.recurringJournalEntry.findUnique({
    where: { id: recurringId },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });

  if (!r) {
    return { recurringId, name: "(unknown)", posted: false, error: "Template not found." };
  }
  if (!r.isActive) {
    return { recurringId, name: r.name, posted: false, error: "Template is paused." };
  }
  if (r.lines.length < 2) {
    return { recurringId, name: r.name, posted: false, error: "Template has fewer than 2 lines." };
  }
  if (r.endDate && r.nextRunDate > r.endDate) {
    await db.recurringJournalEntry.update({
      where: { id: r.id },
      data: { isActive: false },
    });
    return { recurringId, name: r.name, posted: false, error: "Past end date; deactivated." };
  }

  try {
    const entry = await postJournalEntry(
      {
        tenantId: r.tenantId,
        entityId: r.entityId,
        entryDate: r.nextRunDate,
        description: r.description ?? `Recurring: ${r.name}`,
        memo: r.memo ?? undefined,
        source: "ADJUSTMENT",
        sourceRefId: `recurring:${r.id}`,
        lines: r.lines.map((l) => ({
          accountId: l.accountId,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          memo: l.memo ?? undefined,
          classTag: l.classTag ?? undefined,
          locationTag: l.locationTag ?? undefined,
          departmentTag: l.departmentTag ?? undefined,
        })),
      },
      { postedByUserId },
    );

    const newNext = advanceDate(r.nextRunDate, r.frequency);
    const stillActive = r.endDate ? newNext <= r.endDate : true;
    await db.recurringJournalEntry.update({
      where: { id: r.id },
      data: {
        lastRunDate: r.nextRunDate,
        nextRunDate: newNext,
        runCount: { increment: 1 },
        isActive: stillActive,
      },
    });

    return { recurringId: r.id, name: r.name, posted: true, journalEntryId: entry.id };
  } catch (err) {
    const msg =
      err instanceof LedgerError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Unknown error.";
    return { recurringId: r.id, name: r.name, posted: false, error: msg };
  }
}
