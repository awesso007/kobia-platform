/*
 * SLA computation (Sprint 15). Pure functions that derive a ticket's first
 * response and resolution due dates from an SlaPolicy. Kept free of any DB or
 * server-only import so both the create path and the breach-checker cron can
 * reuse them. Priority overrides on the policy let a single policy carry tighter
 * targets for HIGH/URGENT tickets (priorityOverrides is a JSON map of
 * priority -> { firstResponseMinutes?, resolveMinutes? }).
 *
 * businessHoursOnly is honored coarsely: we treat business hours as Mon-Fri
 * 09:00-17:00 in the server's timezone and roll a due date forward across
 * nights/weekends. This is an approximation good enough for the alpha; a full
 * calendar/holiday engine is out of scope.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type SlaTargets = { firstResponseMinutes: number; resolveMinutes: number };

export type PriorityOverrideMap = Partial<
  Record<Priority, Partial<SlaTargets>>
>;

export type SlaPolicyShape = {
  firstResponseMinutes: number;
  resolveMinutes: number;
  businessHoursOnly: boolean;
  priorityOverrides: unknown;
};

const BIZ_START_HOUR = 9;
const BIZ_END_HOUR = 17;

/** Resolve the effective first-response/resolve targets for a priority. */
export function effectiveTargets(policy: SlaPolicyShape, priority: Priority): SlaTargets {
  const base: SlaTargets = {
    firstResponseMinutes: policy.firstResponseMinutes,
    resolveMinutes: policy.resolveMinutes,
  };
  const overrides = parseOverrides(policy.priorityOverrides);
  const o = overrides?.[priority];
  if (o) {
    if (typeof o.firstResponseMinutes === "number") base.firstResponseMinutes = o.firstResponseMinutes;
    if (typeof o.resolveMinutes === "number") base.resolveMinutes = o.resolveMinutes;
  }
  return base;
}

function parseOverrides(raw: unknown): PriorityOverrideMap | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as PriorityOverrideMap;
}

/** True when the date falls inside Mon-Fri 09:00-17:00. */
function isBusinessTime(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const h = d.getHours();
  return h >= BIZ_START_HOUR && h < BIZ_END_HOUR;
}

/** Advance `d` to the next business-time instant if it is currently outside. */
function nextBusinessStart(d: Date): Date {
  const out = new Date(d);
  // Walk forward in 30-minute steps until we land in business time. Bounded.
  for (let i = 0; i < 24 * 14 * 2; i++) {
    if (isBusinessTime(out)) return out;
    out.setMinutes(out.getMinutes() + 30);
  }
  return out;
}

/**
 * Add `minutes` of clock time to `from`. When businessHoursOnly is true, only
 * minutes that fall within business hours are counted, so the returned due date
 * skips nights and weekends.
 */
export function addSlaMinutes(from: Date, minutes: number, businessHoursOnly: boolean): Date {
  if (!businessHoursOnly) return new Date(from.getTime() + minutes * 60_000);
  let remaining = minutes;
  let cursor = nextBusinessStart(from);
  // Consume remaining minutes in business-time chunks.
  while (remaining > 0) {
    if (!isBusinessTime(cursor)) {
      cursor = nextBusinessStart(cursor);
      continue;
    }
    cursor = new Date(cursor.getTime() + 60_000);
    remaining -= 1;
  }
  return cursor;
}

/** Compute due dates for a ticket created at `createdAt` under a policy. */
export function computeDueDates(
  policy: SlaPolicyShape,
  priority: Priority,
  createdAt: Date,
): { firstResponseDueAt: Date; resolveDueAt: Date } {
  const targets = effectiveTargets(policy, priority);
  return {
    firstResponseDueAt: addSlaMinutes(createdAt, targets.firstResponseMinutes, policy.businessHoursOnly),
    resolveDueAt: addSlaMinutes(createdAt, targets.resolveMinutes, policy.businessHoursOnly),
  };
}
