/*
 * Public booking slots endpoint (Sprint 12). GET returns the bookable start
 * times for a BookingPage on a given UTC date. Unauthenticated; tenant resolved
 * from a validated `?t=<slug>` query param (the middleware does not attach a
 * tenant header for /api/book). No requirePermission by design (public surface).
 *
 * Query: ?t=<tenant>&date=YYYY-MM-DD
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { getBookingSlots } from "@/lib/calendar/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) return NextResponse.json({ ok: false, slots: [] }, { status: 400 });

  const dateStr = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ ok: false, slots: [] }, { status: 400 });
  }
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dayUtc = new Date(Date.UTC(y, m - 1, d));

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const page = await db.bookingPage.findUnique({
      where: { slug: params.slug },
      select: {
        id: true,
        active: true,
        durationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
        minNoticeMinutes: true,
        maxAdvanceDays: true,
        ownerClerkUserId: true,
      },
    });
    if (!page || !page.active) return NextResponse.json({ ok: false, slots: [] }, { status: 404 });

    const slots = await getBookingSlots(db, page, dayUtc);
    return NextResponse.json({
      ok: true,
      slots: slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
    });
  } catch {
    return NextResponse.json({ ok: false, slots: [] }, { status: 500 });
  }
}
