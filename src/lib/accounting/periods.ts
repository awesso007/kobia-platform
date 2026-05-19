/**
 * Accounting period management — month/quarter close + lock.
 *
 * Rules (Lock from year-end close workflow):
 *   - A period covers [startDate, endDate] inclusive at UTC midnight.
 *   - status=OPEN  → journal entries with entryDate inside the window can post.
 *   - status=CLOSED → posting is rejected. Existing entries are flagged periodLocked=true.
 *   - Reopening a CLOSED period requires a reason (audit trail).
 *   - Closing requires the period to have no DRAFT entries.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

export class PeriodError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PeriodError";
  }
}

/** UTC midnight of the given date. */
export function utcMidnight(d: Date | string): Date {
  const x = typeof d === "string" ? new Date(d) : new Date(d.getTime());
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

/** First day of a calendar month in UTC. */
export function monthStart(year: number, monthIdx: number): Date {
  return new Date(Date.UTC(year, monthIdx, 1));
}

/** Last day of a calendar month in UTC (e.g. Jan -> Jan 31 23:59:59.999 UTC normalized to midnight of Jan 31). */
export function monthEnd(year: number, monthIdx: number): Date {
  // Day 0 of next month = last day of current month
  return new Date(Date.UTC(year, monthIdx + 1, 0));
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(year: number, monthIdx: number): string {
  return `${MONTH_LABELS[monthIdx]} ${year}`;
}

/**
 * Ensure a monthly period exists for the given (entityId, year, monthIdx).
 * Idempotent — returns the existing or newly-created period.
 */
export async function ensureMonthlyPeriod(
  tenantId: string,
  entityId: string,
  year: number,
  monthIdx: number,
  client?: Prisma.TransactionClient | PrismaClient
): Promise<{ id: string; status: "OPEN" | "CLOSED" }> {
  const tx = client ?? db;
  const start = monthStart(year, monthIdx);
  const end = monthEnd(year, monthIdx);
  const label = monthLabel(year, monthIdx);

  const existing = await tx.accountingPeriod.findUnique({
    where: { entityId_startDate: { entityId, startDate: start } },
    select: { id: true, status: true },
  });
  if (existing) return existing;

  const created = await tx.accountingPeriod.create({
    data: {
      tenantId,
      entityId,
      startDate: start,
      endDate: end,
      label,
      status: "OPEN",
    },
    select: { id: true, status: true },
  });
  return created;
}

/** Auto-generate periods from entity creation through current month if missing. */
export async function backfillPeriods(
  tenantId: string,
  entityId: string,
  fromYear: number,
  fromMonthIdx: number
): Promise<number> {
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth();

  let count = 0;
  let y = fromYear;
  let m = fromMonthIdx;
  while (y < curYear || (y === curYear && m <= curMonth)) {
    const before = await db.accountingPeriod.count({
      where: { entityId, startDate: monthStart(y, m) },
    });
    if (before === 0) {
      await ensureMonthlyPeriod(tenantId, entityId, y, m);
      count++;
    }
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return count;
}

/** Returns the period whose [start,end] contains the given date (if any). */
export async function findPeriodForDate(
  entityId: string,
  entryDate: Date,
  client?: Prisma.TransactionClient | PrismaClient
) {
  const tx = client ?? db;
  const day = utcMidnight(entryDate);
  return tx.accountingPeriod.findFirst({
    where: {
      entityId,
      startDate: { lte: day },
      endDate: { gte: day },
    },
    select: { id: true, status: true, label: true, startDate: true, endDate: true },
  });
}

/**
 * Hard check used by the ledger: throws PeriodError if entryDate falls in a CLOSED period.
 * Does NOT auto-create periods. Caller must run ensureMonthlyPeriod beforehand if needed.
 */
export async function assertDateNotLocked(
  entityId: string,
  entryDate: Date,
  client?: Prisma.TransactionClient | PrismaClient
): Promise<void> {
  const period = await findPeriodForDate(entityId, entryDate, client);
  if (period && period.status === "CLOSED") {
    throw new PeriodError(
      "PERIOD_CLOSED",
      `Cannot post to a closed period (${period.label}). Reopen it first if a correction is needed.`
    );
  }
}

/** List periods for an entity, newest first. */
export async function listPeriods(entityId: string) {
  return db.accountingPeriod.findMany({
    where: { entityId },
    orderBy: { startDate: "desc" },
  });
}

/** Close a period. Marks all POSTED entries inside the window as periodLocked. */
export async function closePeriod(input: {
  periodId: string;
  closedByUserId?: string;
  closingNote?: string;
}) {
  return db.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findUnique({
      where: { id: input.periodId },
    });
    if (!period) throw new PeriodError("NOT_FOUND", "Period not found.");
    if (period.status === "CLOSED") {
      throw new PeriodError("ALREADY_CLOSED", `${period.label} is already closed.`);
    }

    // Reject if any DRAFT entries exist in the window.
    const draftCount = await tx.journalEntry.count({
      where: {
        entityId: period.entityId,
        entryDate: { gte: period.startDate, lte: period.endDate },
        status: "DRAFT",
      },
    });
    if (draftCount > 0) {
      throw new PeriodError(
        "DRAFTS_EXIST",
        `Cannot close ${period.label}: ${draftCount} draft entr${draftCount === 1 ? "y" : "ies"} must be posted or discarded first.`
      );
    }

    await tx.accountingPeriod.update({
      where: { id: period.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: input.closedByUserId,
        closingNote: input.closingNote,
        reopenedAt: null,
        reopenedByUserId: null,
        reopenReason: null,
      },
    });

    // Lock all entries inside the window.
    const lockResult = await tx.journalEntry.updateMany({
      where: {
        entityId: period.entityId,
        entryDate: { gte: period.startDate, lte: period.endDate },
        status: "POSTED",
      },
      data: { periodLocked: true },
    });

    return { period: period.label, lockedEntries: lockResult.count };
  });
}

/** Reopen a closed period. Requires a reason for audit trail. */
export async function reopenPeriod(input: {
  periodId: string;
  reopenedByUserId?: string;
  reason: string;
}) {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new PeriodError("REASON_REQUIRED", "A reason of at least 5 characters is required to reopen a period.");
  }

  return db.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findUnique({
      where: { id: input.periodId },
    });
    if (!period) throw new PeriodError("NOT_FOUND", "Period not found.");
    if (period.status === "OPEN") {
      throw new PeriodError("ALREADY_OPEN", `${period.label} is already open.`);
    }

    await tx.accountingPeriod.update({
      where: { id: period.id },
      data: {
        status: "OPEN",
        reopenedAt: new Date(),
        reopenedByUserId: input.reopenedByUserId,
        reopenReason: input.reason.trim(),
      },
    });

    await tx.journalEntry.updateMany({
      where: {
        entityId: period.entityId,
        entryDate: { gte: period.startDate, lte: period.endDate },
        periodLocked: true,
      },
      data: { periodLocked: false },
    });

    return { period: period.label };
  });
}
