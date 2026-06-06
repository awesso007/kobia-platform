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
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { notifyOn } from "@/lib/notifications/notify";

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
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400, headers: CORS });
  }
  const bookingId = body.bookingId?.trim();
  const token = body.token?.trim();
  if (!bookingId || !token) {
    return NextResponse.json({ ok: false, error: "Missing booking reference." }, { status: 400, headers: CORS });
  }

  const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
  const booking = await db.booking.findFirst({
    where: { id: bookingId, bookingPage: { slug: params.slug } },
    include: { bookingPage: { select: { name: true, ownerClerkUserId: true } } },
  });
  if (!booking || booking.rescheduleToken !== token) {
    return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404, headers: CORS });
  }
  if (booking.status === "CANCELED") {
    return NextResponse.json({ ok: true, alreadyCanceled: true }, { status: 200, headers: CORS });
  }

  await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELED" as never } });
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
