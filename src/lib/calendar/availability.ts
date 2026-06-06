/*
 * Free/busy + slot computation (Sprint 12). Server-only helpers used by the
 * event drawer "Find a time" widget and the public booking slot computation.
 *
 * All times are handled in UTC for storage; callers convert for display. The
 * booking slot logic intentionally treats availability windows as wall-clock
 * minutes-of-day in UTC for v0.3 simplicity (full per-timezone DST handling is
 * a v0.4 concern, noted in the booking page settings copy).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { overlaps } from "./shared";

export type BusySlot = { startAt: Date; endAt: Date; title: string };

/**
 * Events the user is busy for in [from, to): where they organize OR attend with
 * a response other than DECLINED, and the event is not CANCELED.
 */
export async function getBusySlots(
  db: PrismaClient,
  clerkUserId: string,
  from: Date,
  to: Date,
): Promise<BusySlot[]> {
  const events = await db.calendarEvent.findMany({
    where: {
      status: { not: "CANCELED" },
      startAt: { lt: to },
      endAt: { gt: from },
      OR: [
        { organizerClerkUserId: clerkUserId },
        { attendees: { some: { clerkUserId, response: { not: "DECLINED" } } } },
      ],
    },
    select: { startAt: true, endAt: true, title: true },
    orderBy: { startAt: "asc" },
  });
  return events.map((e) => ({ startAt: e.startAt, endAt: e.endAt, title: e.title }));
}

/** A user's working-hours windows for a given UTC day-of-week (0-6). */
export async function getWorkingWindows(
  db: PrismaClient,
  clerkUserId: string,
  dayOfWeek: number,
): Promise<Array<{ startMinutes: number; endMinutes: number }>> {
  const rows = await db.availability.findMany({
    where: { clerkUserId, dayOfWeek },
    select: { startMinutes: true, endMinutes: true },
    orderBy: { startMinutes: "asc" },
  });
  return rows;
}

export type FreeSlot = { startAt: Date; endAt: Date };

/**
 * Free slots of `durationMinutes` for a user across [from, to), respecting their
 * Availability windows and busy events. Slots step by `durationMinutes`. Returns
 * UTC Date pairs.
 */
export async function getFreeSlots(
  db: PrismaClient,
  clerkUserId: string,
  durationMinutes: number,
  from: Date,
  to: Date,
): Promise<FreeSlot[]> {
  const busy = await getBusySlots(db, clerkUserId, from, to);
  const out: FreeSlot[] = [];
  const dayCursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));

  while (dayCursor < to) {
    const dow = dayCursor.getUTCDay();
    const windows = await getWorkingWindows(db, clerkUserId, dow);
    for (const w of windows) {
      for (let m = w.startMinutes; m + durationMinutes <= w.endMinutes; m += durationMinutes) {
        const slotStart = new Date(dayCursor);
        slotStart.setUTCMinutes(m);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
        if (slotStart < from || slotEnd > to) continue;
        const conflict = busy.some((b) =>
          overlaps(slotStart.getTime(), slotEnd.getTime(), b.startAt.getTime(), b.endAt.getTime()),
        );
        if (!conflict) out.push({ startAt: slotStart, endAt: slotEnd });
      }
    }
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Compute bookable slots for a public BookingPage on a specific UTC date.
 * Applies the page's own availability windows, duration + buffers, min-notice,
 * max-advance, and existing (non-canceled) bookings.
 */
export async function getBookingSlots(
  db: PrismaClient,
  page: {
    id: string;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeMinutes: number;
    maxAdvanceDays: number;
    ownerClerkUserId: string | null;
  },
  dayUtc: Date,
): Promise<FreeSlot[]> {
  const now = Date.now();
  const noticeFloor = now + page.minNoticeMinutes * 60_000;
  const advanceCeil = now + page.maxAdvanceDays * 86_400_000;

  const dayStart = new Date(Date.UTC(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth(), dayUtc.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const dow = dayStart.getUTCDay();

  const windows = await db.bookingAvailability.findMany({
    where: { bookingPageId: page.id, dayOfWeek: dow },
    select: { startMinutes: true, endMinutes: true },
    orderBy: { startMinutes: "asc" },
  });
  if (windows.length === 0) return [];

  // Existing bookings on the page for this day (block those times).
  const existing = await db.booking.findMany({
    where: {
      bookingPageId: page.id,
      status: { notIn: ["CANCELED"] },
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
    },
    select: { startAt: true, endAt: true },
  });

  // Owner busy events (so the owner is not double-booked across calendars).
  const ownerBusy = page.ownerClerkUserId
    ? await getBusySlots(db, page.ownerClerkUserId, dayStart, dayEnd)
    : [];

  const step = page.durationMinutes;
  const out: FreeSlot[] = [];
  for (const w of windows) {
    for (let m = w.startMinutes; m + page.durationMinutes <= w.endMinutes; m += step) {
      const slotStart = new Date(dayStart);
      slotStart.setUTCMinutes(m);
      const slotEnd = new Date(slotStart.getTime() + page.durationMinutes * 60_000);
      if (slotStart.getTime() < noticeFloor) continue;
      if (slotStart.getTime() > advanceCeil) continue;

      const blockStart = slotStart.getTime() - page.bufferBeforeMinutes * 60_000;
      const blockEnd = slotEnd.getTime() + page.bufferAfterMinutes * 60_000;

      const taken =
        existing.some((b) => overlaps(blockStart, blockEnd, b.startAt.getTime(), b.endAt.getTime())) ||
        ownerBusy.some((b) => overlaps(blockStart, blockEnd, b.startAt.getTime(), b.endAt.getTime()));
      if (!taken) out.push({ startAt: slotStart, endAt: slotEnd });
    }
  }
  return out;
}
