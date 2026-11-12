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
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activePublicTenantSchema } from "@/lib/security/public-tenant";
import { reservePublicBooking, publicBookingFailure } from "@/lib/calendar/public-booking";
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

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const startIso = typeof body?.startAt === "string" ? body.startAt.trim() : "";
  if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400, headers: CORS });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400, headers: CORS });
  }
  if (!startIso || Number.isNaN(Date.parse(startIso))) {
    return NextResponse.json({ ok: false, error: "Please choose a time slot." }, { status: 400, headers: CORS });
  }
  const startAt = new Date(startIso);

  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400, headers: CORS });
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
  const answers = body.answers;
  if (name.length > 160 || email.length > 254 || phone.length > 50 || timezone.length > 100 ||
      (answers !== undefined && (answers === null || Array.isArray(answers) ||
        typeof answers !== "object" || Object.keys(answers).length > 20 ||
        Object.entries(answers).some(([k, v]) =>
          k.length > 100 || typeof v !== "string" || v.length > 1500)))) {
    return NextResponse.json({ ok: false, error: "Booking details are too long or invalid." }, { status: 400, headers: CORS });
  }

  let schema: string | null;
  try { schema = await activePublicTenantSchema(tenantSlug); }
  catch { return NextResponse.json({ ok: false, error: "Booking unavailable." }, { status: 503, headers: CORS }); }
  if (!schema) return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404, headers: CORS });

  const db = getTenantPrisma(schema);
  let reserved: Awaited<ReturnType<typeof reservePublicBooking>>;
  try {
    reserved = await reservePublicBooking(db, {
      slug: params.slug, startAt, name, email, phone, timezone,
      answers: answers as Record<string, string> | undefined,
    });
  } catch (error) {
    const failure = publicBookingFailure(error);
    return NextResponse.json({ ok: false, error: failure.message }, { status: failure.status, headers: CORS });
  }

  // Effects only after successful COMMIT. No email/automation on a 409.
  if (reserved.newContactId) {
    await reindex(db, "CONTACT", reserved.newContactId).catch(() => {});
  }
  if (reserved.ownerClerkUserId) {
    await notifyOn(db, reserved.ownerClerkUserId, {
      type: "BOOKING_CREATED",
      title: "New booking: " + reserved.pageName,
      body: name + " booked " + startAt.toISOString(),
      linkUrl: "/app/calendar?event=" + reserved.eventId,
    }).catch(() => {});
  }
  try {
    const account = await db.emailAccount.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
    if (account) {
      const html = "<p>Hi " + escapeHtml(name) + ",</p><p>Your booking for <strong>" +
        escapeHtml(reserved.pageName) + "</strong> is " +
        (reserved.requireApproval ? "received and pending confirmation" : "confirmed") +
        ".</p><p>When: " + startAt.toISOString() + "</p>" +
        (reserved.locationLabel ? "<p>Where: " + escapeHtml(reserved.locationLabel) + "</p>" : "");
      await sendEmail({
        accountId: account.id, to: [email],
        subject: "Booking " + (reserved.requireApproval ? "received" : "confirmed") + ": " + reserved.pageName,
        html, recordType: reserved.contactId ? "CONTACT" : undefined,
        recordId: reserved.contactId ?? undefined,
      }, db);
    }
  } catch { /* Best-effort confirmation. */ }
  await dispatchAutomation({
    type: "BOOKING_CONFIRMED", entityType: "BOOKING", entityId: reserved.bookingId,
  }, db).catch(() => {});

  return NextResponse.json({
    ok: true, bookingId: reserved.bookingId,
    rescheduleToken: reserved.rescheduleToken,
    redirectUrl: reserved.redirectUrl ?? null,
    requireApproval: reserved.requireApproval,
  }, { status: 200, headers: CORS });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
