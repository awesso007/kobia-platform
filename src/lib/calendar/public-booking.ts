/**
 * Public reservations must commit page/slot check, contact, calendar event,
 * attendee and booking together. Other outbound effects run AFTER commit.
 * SERIALIZABLE ensures a conflicting simultaneous slot reader fails closed.
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { getBookingSlots } from "./availability";

export type PublicBookingInput = {
  slug: string; startAt: Date; name: string; email: string;
  phone?: string; timezone?: string; answers?: Record<string, string>;
};
export type PublicBookingErrorKind = "PAGE" | "SLOT" | "CALENDAR";
export class PublicBookingError extends Error {
  constructor(readonly kind: PublicBookingErrorKind) {
    super("Public booking unavailable: " + kind);
  }
}
export function publicBookingFailure(error: unknown): { status: number; message: string } {
  if (error instanceof PublicBookingError) {
    if (error.kind === "PAGE") return { status: 404, message: "This booking page is not available." };
    if (error.kind === "SLOT") return { status: 409, message: "That time is no longer available. Please pick another slot." };
    return { status: 503, message: "This booking page is not fully configured yet." };
  }
  // An aborted serialization is never a confirmed reservation.
  if (error !== null && typeof error === "object" && "code" in error && error.code === "P2034")
    return { status: 409, message: "That time may have been taken. Please choose an available slot." };
  return { status: 503, message: "Could not complete the booking. Please try again." };
}
type Question = { id: string; label: string };
function description(email: string, phone: string | undefined,
  questions: unknown, answers: Record<string, string> | undefined): string {
  const lines = ["Email: " + email];
  if (phone) lines.push("Phone: " + phone);
  if (Array.isArray(questions)) for (const q of questions as Question[]) {
    if (typeof q?.id !== "string" || typeof q?.label !== "string") continue;
    const value = answers?.[q.id];
    if (value) lines.push(q.label + ": " + value);
  }
  return lines.join("\n");
}

export async function reservePublicBooking(db: PrismaClient, input: PublicBookingInput) {
  return db.$transaction(async tx => {
    const page = await tx.bookingPage.findUnique({ where: { slug: input.slug } });
    if (!page || !page.active) throw new PublicBookingError("PAGE");
    const slots = await getBookingSlots(tx, page, input.startAt);
    if (!slots.some(s => s.startAt.getTime() === input.startAt.getTime()))
      throw new PublicBookingError("SLOT");

    // Never fall back to a different employee's PERSONAL calendar.
    const calendar = page.ownerClerkUserId
      ? ((await tx.calendar.findFirst({
          where: { ownerClerkUserId: page.ownerClerkUserId, isDefault: true },
          select: { id: true },
        })) ?? (await tx.calendar.findFirst({
          where: { ownerClerkUserId: page.ownerClerkUserId },
          orderBy: { createdAt: "asc" }, select: { id: true },
        })))
      : ((await tx.calendar.findFirst({
          where: { type: "TEAM", isDefault: true }, select: { id: true },
        })) ?? (await tx.calendar.findFirst({
          where: { type: "TEAM" },
          orderBy: { createdAt: "asc" }, select: { id: true },
        })));
    if (!calendar) throw new PublicBookingError("CALENDAR");

    let newContactId: string | null = null;
    let contactId: string | null = null;
    const existing = await tx.contact.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) contactId = existing.id;
    else {
      const parts = input.name.split(/\s+/);
      const contact = await tx.contact.create({ data: {
        firstName: parts[0] || input.name,
        lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
        email: input.email, phone: input.phone || null,
      }});
      contactId = contact.id;
      newContactId = contact.id;
    }

    const startAt = input.startAt;
    const endAt = new Date(startAt.getTime() + page.durationMinutes * 60_000);
    const locationLabel = page.locationDetails?.trim() || null;
    const event = await tx.calendarEvent.create({ data: {
      calendarId: calendar.id,
      title: page.name + " with " + input.name,
      description: description(input.email, input.phone, page.customQuestions, input.answers),
      location: page.locationType === "IN_PERSON" ? locationLabel : null,
      locationUrl: page.locationType === "VIDEO_LINK" ? locationLabel : null,
      startAt, endAt, allDay: false, timezone: page.timezone || "UTC",
      status: (page.requireApproval ? "TENTATIVE" : "CONFIRMED") as never,
      visibility: "PRIVATE" as never,
      organizerClerkUserId: page.ownerClerkUserId,
      source: "BOOKING" as never,
      relatedRecordType: (contactId ? "CONTACT" : null) as never,
      relatedRecordId: contactId,
    }});
    // Do not suppress a failed attendee insert and commit an orphan event.
    await tx.eventAttendee.create({ data: {
      eventId: event.id, clerkUserId: null, contactId,
      email: input.email, name: input.name,
      response: "ACCEPTED" as never, isOrganizer: false, isOptional: false,
    }});
    const rescheduleToken = randomBytes(18).toString("hex");
    const booking = await tx.booking.create({ data: {
      bookingPageId: page.id, eventId: event.id,
      inviteeName: input.name, inviteeEmail: input.email,
      inviteePhone: input.phone || null,
      inviteeTimezone: input.timezone || page.timezone || "UTC",
      startAt, endAt,
      status: (page.requireApproval ? "PENDING" : "CONFIRMED") as never,
      rescheduleToken, customAnswers: (input.answers ?? {}) as never,
    }});
    return {
      bookingId: booking.id, eventId: event.id, rescheduleToken,
      newContactId, contactId, pageName: page.name,
      ownerClerkUserId: page.ownerClerkUserId,
      requireApproval: page.requireApproval,
      redirectUrl: page.redirectUrl, locationLabel,
    };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });
}
