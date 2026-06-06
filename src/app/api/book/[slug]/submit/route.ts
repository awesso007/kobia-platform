/*
 * Public booking submit endpoint (Sprint 12). POST creates a Booking against a
 * BookingPage, materializes a CalendarEvent on the page owner's default
 * calendar, upserts the invitee as a Contact (created + reindexed if unknown),
 * notifies the owner in-app, sends a confirmation email (best-effort), and runs
 * BOOKING_CONFIRMED automations. Unauthenticated and CORS-open so it can be
 * called from an embedded widget.
 *
 * Tenant is resolved from a validated `?t=<slug>` query param (the middleware
 * does not attach a tenant header for /api/book). NO requirePermission by
 * design: this is a public scheduling surface (Sprint 12 constraint).
 *
 * The chosen slot is re-validated server-side against getBookingSlots so a
 * stale or hand-crafted start time cannot double-book.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { getBookingSlots } from "@/lib/calendar/availability";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex } from "@/lib/search";
import { notifyOn } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400, headers: CORS });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429, headers: CORS });
  }

  let body: {
    startAt?: string;
    name?: string;
    email?: string;
    phone?: string;
    timezone?: string;
    answers?: Record<string, string>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400, headers: CORS });
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const startIso = body.startAt?.trim();
  if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400, headers: CORS });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400, headers: CORS });
  }
  if (!startIso || Number.isNaN(Date.parse(startIso))) {
    return NextResponse.json({ ok: false, error: "Please choose a time slot." }, { status: 400, headers: CORS });
  }
  const startAt = new Date(startIso);

  const db = getTenantPrisma(schemaNameForSlug(tenantSlug));

  const page = await db.bookingPage.findUnique({ where: { slug: params.slug } });
  if (!page || !page.active) {
    return NextResponse.json({ ok: false, error: "This booking page is not available." }, { status: 404, headers: CORS });
  }

  // Re-validate the slot server-side against current availability + bookings.
  const slots = await getBookingSlots(db, page, startAt);
  const valid = slots.some((s) => s.startAt.getTime() === startAt.getTime());
  if (!valid) {
    return NextResponse.json({ ok: false, error: "That time is no longer available. Please pick another slot." }, { status: 409, headers: CORS });
  }
  const endAt = new Date(startAt.getTime() + page.durationMinutes * 60_000);

  // Upsert the invitee as a Contact (create + index if unknown).
  let contactId: string | null = null;
  try {
    const existing = await db.contact.findFirst({ where: { email }, select: { id: true } });
    if (existing) {
      contactId = existing.id;
    } else {
      const parts = name.split(/\s+/);
      const firstName = parts[0] || name;
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
      const contact = await db.contact.create({
        data: { firstName, lastName, email, phone: body.phone?.trim() || null },
      });
      contactId = contact.id;
      await reindex(db, "CONTACT", contact.id).catch(() => {});
    }
  } catch (err) {
    console.error("[book/submit] contact upsert failed", err);
  }

  // Resolve the owner's default calendar (fall back to any default, then any).
  const calendar =
    (page.ownerClerkUserId
      ? await db.calendar.findFirst({ where: { ownerClerkUserId: page.ownerClerkUserId, isDefault: true }, select: { id: true } })
      : null) ??
    (await db.calendar.findFirst({ where: { isDefault: true }, select: { id: true } })) ??
    (await db.calendar.findFirst({ where: { type: { in: ["PERSONAL", "TEAM"] } }, orderBy: { createdAt: "asc" }, select: { id: true } }));

  if (!calendar) {
    return NextResponse.json({ ok: false, error: "This booking page is not fully configured yet." }, { status: 503, headers: CORS });
  }

  const locationLabel = page.locationDetails?.trim() || null;
  const initialStatus = page.requireApproval ? "PENDING" : "CONFIRMED";
  const rescheduleToken = randomBytes(18).toString("hex");

  let bookingId: string;
  let eventId: string;
  try {
    const event = await db.calendarEvent.create({
      data: {
        calendarId: calendar.id,
        title: `${page.name} with ${name}`,
        description: buildDescription(email, body.phone, page.customQuestions, body.answers),
        location: page.locationType === "IN_PERSON" ? locationLabel : null,
        locationUrl: page.locationType === "VIDEO_LINK" ? locationLabel : null,
        startAt,
        endAt,
        allDay: false,
        timezone: page.timezone || "UTC",
        status: (page.requireApproval ? "TENTATIVE" : "CONFIRMED") as never,
        visibility: "PRIVATE" as never,
        organizerClerkUserId: page.ownerClerkUserId,
        source: "BOOKING" as never,
        relatedRecordType: (contactId ? "CONTACT" : null) as never,
        relatedRecordId: contactId,
      },
    });
    eventId = event.id;

    // Attendee row for the invitee (external contact, no clerk user).
    await db.eventAttendee.create({
      data: {
        eventId: event.id,
        clerkUserId: null,
        contactId,
        email,
        name,
        response: "ACCEPTED" as never,
        isOrganizer: false,
        isOptional: false,
      },
    }).catch(() => {});

    const booking = await db.booking.create({
      data: {
        bookingPageId: page.id,
        eventId: event.id,
        inviteeName: name,
        inviteeEmail: email,
        inviteePhone: body.phone?.trim() || null,
        inviteeTimezone: body.timezone?.trim() || page.timezone || "UTC",
        startAt,
        endAt,
        status: initialStatus as never,
        rescheduleToken,
        customAnswers: (body.answers ?? {}) as never,
      },
    });
    bookingId = booking.id;
  } catch (err) {
    console.error("[book/submit] booking create failed", err);
    return NextResponse.json({ ok: false, error: "Could not complete the booking." }, { status: 500, headers: CORS });
  }

  // Notify the owner in-app (best-effort).
  if (page.ownerClerkUserId) {
    await notifyOn(db, page.ownerClerkUserId, {
      type: "BOOKING_CREATED",
      title: `New booking: ${page.name}`,
      body: `${name} booked ${startAt.toISOString()}`,
      linkUrl: `/app/calendar?event=${eventId}`,
    }).catch(() => {});
  }

  // Confirmation email to the invitee (best-effort, only if a sending account exists).
  try {
    const account = await db.emailAccount.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
    if (account) {
      const when = startAt.toISOString();
      const html = `<p>Hi ${escapeHtml(name)},</p><p>Your booking for <strong>${escapeHtml(page.name)}</strong> is ${page.requireApproval ? "received and pending confirmation" : "confirmed"}.</p><p>When: ${when}</p>${locationLabel ? `<p>Where: ${escapeHtml(locationLabel)}</p>` : ""}`;
      await sendEmail({ accountId: account.id, to: [email], subject: `Booking ${page.requireApproval ? "received" : "confirmed"}: ${page.name}`, html, recordType: contactId ? "CONTACT" : undefined, recordId: contactId ?? undefined }, db);
    }
  } catch (err) {
    console.error("[book/submit] confirmation email failed", err);
  }

  // Run BOOKING_CONFIRMED automations against the booking (tenant-bound db).
  await dispatchAutomation({ type: "BOOKING_CONFIRMED", entityType: "BOOKING", entityId: bookingId }, db).catch(() => {});

  return NextResponse.json(
    {
      ok: true,
      bookingId,
      rescheduleToken,
      redirectUrl: page.redirectUrl ?? null,
      requireApproval: page.requireApproval,
    },
    { status: 200, headers: CORS },
  );
}

type CustomQuestion = { id: string; label: string };

function buildDescription(
  email: string,
  phone: string | undefined,
  customQuestions: unknown,
  answers: Record<string, string> | undefined,
): string {
  const lines = [`Email: ${email}`];
  if (phone?.trim()) lines.push(`Phone: ${phone.trim()}`);
  const qs = Array.isArray(customQuestions) ? (customQuestions as CustomQuestion[]) : [];
  for (const q of qs) {
    const a = answers?.[q.id];
    if (a && a.trim()) lines.push(`${q.label}: ${a.trim()}`);
  }
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
