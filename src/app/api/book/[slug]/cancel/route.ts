/*
 * Public booking cancel endpoint (Sprint 12). POST cancels a Booking given its
 * id + rescheduleToken (the unguessable token doubles as the cancel/manage
 * secret). Soft-cancels the linked CalendarEvent and notifies the owner.
 * Unauthenticated; tenant resolved from a validated `?t=<slug>` query param.
 * NO requirePermission by design (public surface).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { admitPublicSurface } from "@/lib/security/public-surface-round53";
import { readPublicFormBody, publicFormErrorResponse, PublicFormGateError } from "@/lib/security/public-form-abuse";
import { notifyOn } from "@/lib/notifications/notify";
import { secureBookingManageTokenMatches } from "@/lib/security/booking-manage-token";

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

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400, headers: CORS });

  let body: { bookingId?: string; token?: string };
  try {
    body = JSON.parse(new TextDecoder().decode(await readPublicFormBody(req))) as typeof body;
  } catch (error) {
    const failure = error instanceof PublicFormGateError
      ? publicFormErrorResponse(error) : { status: 400, message: "Invalid body." };
    return NextResponse.json({ ok: false, error: failure.message },
      { status: failure.status, headers: CORS });
  }
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!bookingId || !token || bookingId.length > 128 || token.length > 256) {
    return NextResponse.json({ ok: false, error: "Missing booking reference." }, { status: 400, headers: CORS });
  }

  let db: Awaited<ReturnType<typeof admitPublicSurface>>["db"];
  try {
    ({ db } = await admitPublicSurface(req, {
      tenant: tenantSlug, kind: "booking_manage", resource: params.slug,
    }));
  } catch (error) {
    const failure = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: failure.message },
      { status: failure.status, headers: {
        ...CORS, "Cache-Control": "no-store",
        ...(failure.retryAfter ? { "Retry-After": failure.retryAfter } : {}),
      } });
  }
  const booking = await db.booking.findFirst({
    where: { id: bookingId, bookingPage: { slug: params.slug } },
    include: { bookingPage: { select: { name: true, ownerClerkUserId: true } } },
  });
  if (!booking || !secureBookingManageTokenMatches(token, booking.rescheduleToken)) {
    return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404, headers: CORS });
  }
  // Conditional update prevents two concurrent requests from both executing
  // cancellation side effects; a repeated valid token remains idempotent.
  const canceled = await db.booking.updateMany({
    where: { id: booking.id, rescheduleToken: booking.rescheduleToken, status: { not: "CANCELED" } },
    data: { status: "CANCELED" },
  });
  if (canceled.count === 0) {
    return NextResponse.json({ ok: true, alreadyCanceled: true }, { status: 200, headers: CORS });
  }
  if (booking.eventId) {
    await db.calendarEvent.update({ where: { id: booking.eventId }, data: { status: "CANCELED" as never } }).catch(() => {});
  }

  if (booking.bookingPage.ownerClerkUserId) {
    await notifyOn(db, booking.bookingPage.ownerClerkUserId, {
      type: "BOOKING_CREATED",
      title: `Booking canceled: ${booking.bookingPage.name}`,
      body: `${booking.inviteeName} canceled ${booking.startAt.toISOString()}`,
      linkUrl: booking.eventId ? `/app/calendar?event=${booking.eventId}` : "/app/calendar",
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
}
