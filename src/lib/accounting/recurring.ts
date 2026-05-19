/**
 * Recurring invoices — schedule advancement + invoice generation.
 *
 * A RecurringInvoice has:
 *   - a frequency (WEEKLY/MONTHLY/QUARTERLY/ANNUALLY) × intervalCount
 *   - a startDate, optional endDate, optional maxRuns
 *   - lines (template for invoice lines)
 *
 * Each run creates a new DRAFT invoice and posts it (via postInvoice).
 * `nextRunDate` is advanced after each successful run.
 */
import type { RecurringFrequency } from "@prisma/client";
import { db } from "@/lib/db";
import { postInvoice } from "./ar";

/**
 * Advance a date by N units of the given frequency.
 * MONTHLY uses calendar-month math; if dayOfMonth would not exist
 * (e.g. Feb 30), clamps to the last day of the month.
 */
export function advanceDate(
  from: Date,
  frequency: RecurringFrequency,
  intervalCount: number,
  dayOfMonth?: number | null
): Date {
  const next = new Date(from);
  switch (frequency) {
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7 * intervalCount);
      return next;
    case "MONTHLY": {
      const targetMonth = next.getUTCMonth() + intervalCount;
      const targetYear =
        next.getUTCFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      // last day of target month
      const lastDay = new Date(
        Date.UTC(targetYear, normalizedMonth + 1, 0)
      ).getUTCDate();
      const day = Math.min(
        dayOfMonth ?? next.getUTCDate(),
        lastDay
      );
      return new Date(
        Date.UTC(
          targetYear,
          normalizedMonth,
          day,
          next.getUTCHours(),
          next.getUTCMinutes(),
          next.getUTCSeconds()
        )
      );
    }
    case "QUARTERLY": {
      const targetMonth = next.getUTCMonth() + 3 * intervalCount;
      const targetYear =
        next.getUTCFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const lastDay = new Date(
        Date.UTC(targetYear, normalizedMonth + 1, 0)
      ).getUTCDate();
      const day = Math.min(
        dayOfMonth ?? next.getUTCDate(),
        lastDay
      );
      return new Date(
        Date.UTC(
          targetYear,
          normalizedMonth,
          day,
          next.getUTCHours(),
          next.getUTCMinutes(),
          next.getUTCSeconds()
        )
      );
    }
    case "ANNUALLY": {
      const targetYear = next.getUTCFullYear() + intervalCount;
      const month = next.getUTCMonth();
      const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
      const day = Math.min(
        dayOfMonth ?? next.getUTCDate(),
        lastDay
      );
      return new Date(
        Date.UTC(
          targetYear,
          month,
          day,
          next.getUTCHours(),
          next.getUTCMinutes(),
          next.getUTCSeconds()
        )
      );
    }
  }
}

/**
 * Run a single recurring invoice schedule once.
 *
 * Steps:
 *   1. Verify schedule is ACTIVE and not past its endDate / maxRuns
 *   2. Create a DRAFT invoice with lines copied from the template
 *   3. Call postInvoice(invoice.id) to push it through the ledger
 *   4. Record a RecurringInvoiceRun with the generated invoice id
 *   5. Advance nextRunDate, increment runsCompleted, and mark COMPLETED if done
 *
 * Returns the run record + generated invoice id (or error).
 */
export async function runRecurringInvoiceOnce(args: {
  recurringInvoiceId: string;
  scheduledFor: Date;
}) {
  const { recurringInvoiceId, scheduledFor } = args;

  const schedule = await db.recurringInvoice.findUnique({
    where: { id: recurringInvoiceId },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!schedule) throw new Error("RecurringInvoice not found");

  // Guard: must be ACTIVE
  if (schedule.status !== "ACTIVE") {
    return await db.recurringInvoiceRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringInvoiceId: schedule.id,
        scheduledFor,
        status: "SKIPPED",
        errorMessage: `Schedule status is ${schedule.status}`,
      },
    });
  }

  // Guard: past end date
  if (schedule.endDate && scheduledFor > schedule.endDate) {
    await db.recurringInvoice.update({
      where: { id: schedule.id },
      data: { status: "COMPLETED" },
    });
    return await db.recurringInvoiceRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringInvoiceId: schedule.id,
        scheduledFor,
        status: "SKIPPED",
        errorMessage: "Past end date",
      },
    });
  }

  // Guard: max runs reached
  if (schedule.maxRuns && schedule.runsCompleted >= schedule.maxRuns) {
    await db.recurringInvoice.update({
      where: { id: schedule.id },
      data: { status: "COMPLETED" },
    });
    return await db.recurringInvoiceRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringInvoiceId: schedule.id,
        scheduledFor,
        status: "SKIPPED",
        errorMessage: "Max runs reached",
      },
    });
  }

  if (schedule.lines.length === 0) {
    return await db.recurringInvoiceRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringInvoiceId: schedule.id,
        scheduledFor,
        status: "FAILED",
        errorMessage: "No line template defined",
      },
    });
  }

  try {
    const customer = await db.customer.findUnique({
      where: { id: schedule.customerId },
    });
    const termsDays = schedule.termsDays ?? customer?.defaultTermsDays ?? 30;
    const issueDate = scheduledFor;
    const dueDate = new Date(issueDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + termsDays);

    // Create DRAFT invoice
    const draft = await db.invoice.create({
      data: {
        tenantId: schedule.tenantId,
        entityId: schedule.entityId,
        customerId: schedule.customerId,
        invoiceNumber: 0,
        issueDate,
        dueDate,
        status: "DRAFT",
        currency: schedule.currency,
        memo: schedule.memo,
        lines: {
          create: schedule.lines.map((l) => ({
            tenantId: schedule.tenantId,
            accountId: l.accountId,
            description: l.description,
            quantityMilli: l.quantityMilli,
            unitPriceCents: l.unitPriceCents,
            amountCents: (l.quantityMilli * l.unitPriceCents) / 1000n,
            lineNumber: l.lineNumber,
          })),
        },
      },
    });

    // Post it
    const posted = await postInvoice(draft.id);

    // Advance schedule + record run
    const nextRun = advanceDate(
      schedule.nextRunDate,
      schedule.frequency,
      schedule.intervalCount,
      schedule.dayOfMonth
    );
    const newRunsCompleted = schedule.runsCompleted + 1;
    const hitMaxRuns =
      schedule.maxRuns !== null && newRunsCompleted >= schedule.maxRuns;
    const hitEndDate = schedule.endDate && nextRun > schedule.endDate;
    const completed = hitMaxRuns || hitEndDate;

    await db.recurringInvoice.update({
      where: { id: schedule.id },
      data: {
        nextRunDate: nextRun,
        lastRunDate: scheduledFor,
        runsCompleted: newRunsCompleted,
        status: completed ? "COMPLETED" : "ACTIVE",
      },
    });

    return await db.recurringInvoiceRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringInvoiceId: schedule.id,
        generatedInvoiceId: posted.id,
        scheduledFor,
        status: "SUCCESS",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return await db.recurringInvoiceRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringInvoiceId: schedule.id,
        scheduledFor,
        status: "FAILED",
        errorMessage: msg,
      },
    });
  }
}

/**
 * Sweep all ACTIVE recurring invoices whose `nextRunDate <= now`
 * and generate invoices for them. Returns count of runs.
 *
 * Call this from a cron or admin button.
 */
export async function processDueRecurringInvoices(args: {
  tenantId?: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const due = await db.recurringInvoice.findMany({
    where: {
      status: "ACTIVE",
      nextRunDate: { lte: now },
      ...(args.tenantId ? { tenantId: args.tenantId } : {}),
    },
    select: { id: true, nextRunDate: true },
  });

  let success = 0;
  let failed = 0;
  let skipped = 0;
  for (const s of due) {
    const run = await runRecurringInvoiceOnce({
      recurringInvoiceId: s.id,
      scheduledFor: s.nextRunDate,
    });
    if (run.status === "SUCCESS") success++;
    else if (run.status === "FAILED") failed++;
    else skipped++;
  }

  return { total: due.length, success, failed, skipped };
}
