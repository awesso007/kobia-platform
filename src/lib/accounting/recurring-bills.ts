/**
 * Recurring bills — mirror of recurring invoices for AP.
 *
 * A RecurringBill has:
 *   - a frequency (WEEKLY/MONTHLY/QUARTERLY/ANNUALLY) × intervalCount
 *   - a startDate, optional endDate, optional maxRuns
 *   - lines (template for bill lines: account + amount)
 *
 * Each run creates a new DRAFT bill and posts it (via postBill).
 * `nextRunDate` is advanced after each successful run.
 */
import { db } from "@/lib/db";
import { postBill } from "./ap";
import { advanceDate } from "./recurring";

/**
 * Run a single recurring bill schedule once.
 */
export async function runRecurringBillOnce(args: {
  recurringBillId: string;
  scheduledFor: Date;
}) {
  const { recurringBillId, scheduledFor } = args;

  const schedule = await db.recurringBill.findUnique({
    where: { id: recurringBillId },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!schedule) throw new Error("RecurringBill not found");

  if (schedule.status !== "ACTIVE") {
    return await db.recurringBillRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringBillId: schedule.id,
        scheduledFor,
        status: "SKIPPED",
        errorMessage: `Schedule status is ${schedule.status}`,
      },
    });
  }

  if (schedule.endDate && scheduledFor > schedule.endDate) {
    await db.recurringBill.update({
      where: { id: schedule.id },
      data: { status: "COMPLETED" },
    });
    return await db.recurringBillRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringBillId: schedule.id,
        scheduledFor,
        status: "SKIPPED",
        errorMessage: "Past end date",
      },
    });
  }

  if (schedule.maxRuns && schedule.runsCompleted >= schedule.maxRuns) {
    await db.recurringBill.update({
      where: { id: schedule.id },
      data: { status: "COMPLETED" },
    });
    return await db.recurringBillRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringBillId: schedule.id,
        scheduledFor,
        status: "SKIPPED",
        errorMessage: "Max runs reached",
      },
    });
  }

  if (schedule.lines.length === 0) {
    return await db.recurringBillRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringBillId: schedule.id,
        scheduledFor,
        status: "FAILED",
        errorMessage: "No line template defined",
      },
    });
  }

  try {
    const vendor = await db.vendor.findUnique({
      where: { id: schedule.vendorId },
    });
    const termsDays = schedule.termsDays ?? vendor?.defaultTermsDays ?? 30;
    const billDate = scheduledFor;
    const dueDate = new Date(billDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + termsDays);

    const draft = await db.bill.create({
      data: {
        tenantId: schedule.tenantId,
        entityId: schedule.entityId,
        vendorId: schedule.vendorId,
        billNumber: 0,
        billDate,
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

    const posted = await postBill(draft.id);

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

    await db.recurringBill.update({
      where: { id: schedule.id },
      data: {
        nextRunDate: nextRun,
        lastRunDate: scheduledFor,
        runsCompleted: newRunsCompleted,
        status: completed ? "COMPLETED" : "ACTIVE",
      },
    });

    return await db.recurringBillRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringBillId: schedule.id,
        generatedBillId: posted.id,
        scheduledFor,
        status: "SUCCESS",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return await db.recurringBillRun.create({
      data: {
        tenantId: schedule.tenantId,
        recurringBillId: schedule.id,
        scheduledFor,
        status: "FAILED",
        errorMessage: msg,
      },
    });
  }
}

/**
 * Sweep all ACTIVE recurring bills whose `nextRunDate <= now`
 * and generate bills for them. Returns count of runs.
 */
export async function processDueRecurringBills(args: {
  tenantId?: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const due = await db.recurringBill.findMany({
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
    const run = await runRecurringBillOnce({
      recurringBillId: s.id,
      scheduledFor: s.nextRunDate,
    });
    if (run.status === "SUCCESS") success++;
    else if (run.status === "FAILED") failed++;
    else skipped++;
  }

  return { total: due.length, success, failed, skipped };
}
