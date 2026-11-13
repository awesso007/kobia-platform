/**
 * Disposable tenant PostgreSQL only; validates actual concurrent reservation
 * semantics, linked event+attendee integrity, and fail-closed owner selection.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
import { reservePublicBooking } from "./public-booking";
import type { PublicBookingError } from "./public-booking";

const integration = process.env.RUN_CHESS_DB_INTEGRATION === "1" ? describe : describe.skip;
integration("Round 51 public booking atomic tenant PostgreSQL", () => {
  let db: PrismaClient;
  const unique = randomUUID().slice(0, 12);
  const owner = "round51-owner-" + unique;
  const email = "round51-" + unique + "@example.invalid";
  const slug = "round51-" + unique;
  let calendarId = "";
  let pageId = "";
  let missingCalendarPageId = "";
  let foreignCalendarId = "";
  const startAt = new Date(Date.now() + 8 * 86400_000);
  startAt.setUTCHours(10, 0, 0, 0);

  beforeAll(async () => {
    db = new PrismaClient();
    await db.$connect();
    const calendar = await db.calendar.create({ data: {
      name: "Fictional booking calendar", ownerClerkUserId: owner,
      type: "PERSONAL", isDefault: false,
    }});
    calendarId = calendar.id;
    const foreign = await db.calendar.create({ data: {
      name: "Not this owner's default", ownerClerkUserId: "different-" + owner,
      type: "PERSONAL", isDefault: true,
    }});
    foreignCalendarId = foreign.id;
    const page = await db.bookingPage.create({ data: {
      slug, name: "Fictional appointment", active: true,
      ownerClerkUserId: owner, durationMinutes: 30,
      minNoticeMinutes: 0, maxAdvanceDays: 30,
    }});
    pageId = page.id;
    await db.bookingAvailability.create({ data: {
      bookingPageId: pageId, dayOfWeek: startAt.getUTCDay(),
      startMinutes: 600, endMinutes: 660,
    }});
    const noCalendar = await db.bookingPage.create({ data: {
      slug: slug + "-no-calendar", name: "Unconfigured", active: true,
      ownerClerkUserId: owner + "-no-calendar", durationMinutes: 30,
      minNoticeMinutes: 0, maxAdvanceDays: 30,
    }});
    missingCalendarPageId = noCalendar.id;
    await db.bookingAvailability.create({ data: {
      bookingPageId: missingCalendarPageId, dayOfWeek: startAt.getUTCDay(),
      startMinutes: 600, endMinutes: 660,
    }});
  });
  afterAll(async () => {
    if (!db) return;
    await db.booking.deleteMany({ where: { bookingPageId: { in: [pageId, missingCalendarPageId] } } });
    await db.calendarEvent.deleteMany({ where: { calendarId: { in: [calendarId, foreignCalendarId] } } });
    await db.bookingAvailability.deleteMany({ where: { bookingPageId: { in: [pageId, missingCalendarPageId] } } });
    await db.bookingPage.deleteMany({ where: { id: { in: [pageId, missingCalendarPageId] } } });
    await db.calendar.deleteMany({ where: { id: { in: [calendarId, foreignCalendarId] } } });
    await db.contact.deleteMany({ where: { email } });
    await db.$disconnect();
  });
  it("serializes two overlapping requests and leaves exactly one full reservation", async () => {
    const input = { slug, startAt, name: "Fictional Guest", email };
    const attempts = await Promise.allSettled([
      reservePublicBooking(db, input), reservePublicBooking(db, input),
    ]);
    const success = attempts.filter(x => x.status === "fulfilled");
    expect(success).toHaveLength(1);
    expect(attempts.filter(x => x.status === "rejected")).toHaveLength(1);
    const bookings = await db.booking.findMany({ where: { bookingPageId: pageId } });
    expect(bookings).toHaveLength(1);
    const events = await db.calendarEvent.findMany({ where: { calendarId } });
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(bookings[0]?.eventId);
    expect(await db.eventAttendee.count({ where: { eventId: events[0]!.id } })).toBe(1);
    expect(await db.calendarEvent.count({ where: { calendarId: foreignCalendarId } })).toBe(0);
    expect(await db.contact.count({ where: { email } })).toBe(1);
  });
  it("does not create contact/event/booking when the owner has no calendar", async () => {
    await expect(reservePublicBooking(db, {
      slug: slug + "-no-calendar", startAt,
      name: "Unconfigured Guest", email: "missing-calendar-" + email,
    })).rejects.toMatchObject({ kind: "CALENDAR" } satisfies Partial<PublicBookingError>);
    expect(await db.booking.count({ where: { bookingPageId: missingCalendarPageId } })).toBe(0);
    expect(await db.contact.count({ where: { email: "missing-calendar-" + email } })).toBe(0);
  });
});
