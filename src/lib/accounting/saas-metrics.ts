/**
 * SaaS / Recurring Revenue Metrics.
 *
 * Derived from RecurringInvoice schedules (active subscriptions) and historical
 * RecurringInvoiceRun → generated Invoice records.
 *
 * Metrics computed:
 *  - MRR  (Monthly Recurring Revenue)        — normalized to monthly equivalent
 *  - ARR  (Annual Recurring Revenue)         — MRR * 12
 *  - ACV  (Average Contract Value)           — ARR / active subscription count
 *  - ARPU (Average Revenue Per Account)      — MRR / active customer count
 *  - New MRR added this month                — RecurringInvoices started this month
 *  - Lost MRR (churn) this month             — RecurringInvoices canceled this month
 *  - Net new MRR this month
 *  - Customer count active                    — distinct customers w/ ACTIVE subscriptions
 *  - Subscription count active                — # of ACTIVE RecurringInvoices
 *  - 12-month MRR history (revenue chart)     — month-by-month
 */

import type { PrismaClient } from "@prisma/client";
import { db as defaultDb } from "@/lib/db";

const MILLI = 1000n;

export type SaasMetrics = {
  mrrCents: bigint;
  arrCents: bigint;
  acvCents: bigint;
  arpuCents: bigint;
  newMrrCents: bigint;
  churnedMrrCents: bigint;
  netNewMrrCents: bigint;
  activeSubscriptions: number;
  activeCustomers: number;
  // 12-month trailing history including current month
  mrrHistory: Array<{ month: string; mrrCents: bigint; newSubs: number; churnedSubs: number }>;
};

/**
 * Convert a recurring invoice subscription's line total into a monthly-equivalent value.
 */
function subscriptionMonthlyCents(sub: {
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";
  intervalCount: number;
  lines: Array<{ quantityMilli: bigint; unitPriceCents: bigint }>;
}): bigint {
  const totalCents = sub.lines.reduce((sum, l) => sum + (l.quantityMilli * l.unitPriceCents) / MILLI, 0n);
  const interval = BigInt(Math.max(1, sub.intervalCount));
  switch (sub.frequency) {
    // weekly billing: 4.345 weeks per month — keep BigInt math, use 52/12 multiplier
    // monthly equiv = total per week * (52/12) / interval
    case "WEEKLY":
      return (totalCents * 52n) / (12n * interval);
    case "MONTHLY":
      return totalCents / interval;
    case "QUARTERLY":
      return totalCents / (3n * interval);
    case "ANNUALLY":
      return totalCents / (12n * interval);
    default:
      return totalCents;
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** Was this subscription active on the given month (inclusive)? */
function wasActiveInMonth(
  sub: { startDate: Date; endDate: Date | null; status: string; updatedAt: Date },
  monthStart: Date,
  monthEnd: Date,
): boolean {
  if (sub.startDate >= monthEnd) return false; // started in future
  // If subscription endDate is set and ended before the month starts, it was not active.
  if (sub.endDate && sub.endDate < monthStart) return false;
  // CANCELED / COMPLETED status approximations:
  // - status CANCELED → use updatedAt as the cancel date proxy.
  // - status COMPLETED → endDate is the natural end (already checked).
  if (sub.status === "CANCELED") {
    if (sub.updatedAt < monthStart) return false;
  }
  return true;
}

export async function getSaasMetrics(opts: {
  tenantId: string;
  entityId: string;
  asOf: Date;
  client?: PrismaClient;
}): Promise<SaasMetrics> {
  const client = opts.client ?? defaultDb;

  const subs = await client.recurringInvoice.findMany({
    where: { tenantId: opts.tenantId, entityId: opts.entityId },
    include: { lines: { select: { quantityMilli: true, unitPriceCents: true } } },
  });

  // Current snapshot (as of opts.asOf): ACTIVE subs only.
  const activeSubs = subs.filter((s) => s.status === "ACTIVE" && s.startDate <= opts.asOf && (!s.endDate || s.endDate >= opts.asOf));
  let mrr = 0n;
  const activeCustomerIds = new Set<string>();
  for (const s of activeSubs) {
    mrr += subscriptionMonthlyCents(s);
    activeCustomerIds.add(s.customerId);
  }
  const arr = mrr * 12n;

  const activeSubscriptions = activeSubs.length;
  const activeCustomers = activeCustomerIds.size;
  const acvCents = activeSubscriptions > 0 ? arr / BigInt(activeSubscriptions) : 0n;
  const arpuCents = activeCustomers > 0 ? mrr / BigInt(activeCustomers) : 0n;

  // Monthly history: walk back 12 months (inclusive of current).
  const currentMonthStart = startOfMonth(opts.asOf);
  const history: SaasMetrics["mrrHistory"] = [];

  for (let i = 11; i >= 0; i--) {
    const monthStart = addMonths(currentMonthStart, -i);
    const monthEnd = addMonths(monthStart, 1);

    let monthMrr = 0n;
    let newSubs = 0;
    let churnedSubs = 0;

    for (const s of subs) {
      if (wasActiveInMonth(s, monthStart, monthEnd)) {
        monthMrr += subscriptionMonthlyCents(s);
      }
      // New: started in this month
      if (s.startDate >= monthStart && s.startDate < monthEnd) newSubs += 1;
      // Churned: canceled in this month (CANCELED status w/ updatedAt in month)
      //  OR endDate in this month w/ status COMPLETED
      if (s.status === "CANCELED" && s.updatedAt >= monthStart && s.updatedAt < monthEnd) churnedSubs += 1;
      else if (s.endDate && s.endDate >= monthStart && s.endDate < monthEnd && s.status === "COMPLETED") churnedSubs += 1;
    }

    history.push({ month: monthKey(monthStart), mrrCents: monthMrr, newSubs, churnedSubs });
  }

  // New & churned MRR this month
  let newMrr = 0n;
  let churnedMrr = 0n;
  const thisMonthEnd = addMonths(currentMonthStart, 1);
  for (const s of subs) {
    if (s.startDate >= currentMonthStart && s.startDate < thisMonthEnd) {
      newMrr += subscriptionMonthlyCents(s);
    }
    if (
      (s.status === "CANCELED" && s.updatedAt >= currentMonthStart && s.updatedAt < thisMonthEnd) ||
      (s.endDate && s.endDate >= currentMonthStart && s.endDate < thisMonthEnd && s.status === "COMPLETED")
    ) {
      churnedMrr += subscriptionMonthlyCents(s);
    }
  }

  return {
    mrrCents: mrr,
    arrCents: arr,
    acvCents,
    arpuCents,
    newMrrCents: newMrr,
    churnedMrrCents: churnedMrr,
    netNewMrrCents: newMrr - churnedMrr,
    activeSubscriptions,
    activeCustomers,
    mrrHistory: history,
  };
}
