/*
 * Public reschedule / cancel page (Sprint 12). Validates the bookingId + token
 * against the BookingPage slug, then renders a manage client that can cancel the
 * booking or pick a new slot (cancel old + create new via the public endpoints).
 * Unauthenticated; tenant resolved from a validated `?t=<slug>` query param.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { RescheduleClient } from "./RescheduleClient";
import type { PublicBookingPage } from "../../../BookingClient";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: { slug: string; bookingId: string; token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tParam = Array.isArray(searchParams.t) ? searchParams.t[0] : searchParams.t;
  const tenantSlug = sanitizeSlug(tParam);

  const notAvailable = (
    <Shell>
      <div className="p-8 text-center">
        <p className="text-base font-medium" style={{ color: "var(--kb-text-primary)" }}>This booking could not be found.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>The link may be expired or incorrect.</p>
      </div>
    </Shell>
  );

  if (!tenantSlug) return notAvailable;

  let page: PublicBookingPage | null = null;
  let current: { startAt: string; status: string; inviteeName: string; inviteeEmail: string; inviteePhone: string | null } | null = null;
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const booking = await db.booking.findFirst({
      where: { id: params.bookingId, bookingPage: { slug: params.slug } },
      include: { bookingPage: { include: { availability: { select: { dayOfWeek: true } } } } },
    });
    if (booking && booking.rescheduleToken === params.token) {
      const bp = booking.bookingPage;
      const weekdays = Array.from(new Set(bp.availability.map((a) => a.dayOfWeek))).sort();
      page = {
        tenantSlug,
        slug: bp.slug,
        name: bp.name,
        description: bp.description,
        durationMinutes: bp.durationMinutes,
        minNoticeMinutes: bp.minNoticeMinutes,
        maxAdvanceDays: bp.maxAdvanceDays,
        timezone: bp.timezone,
        color: bp.color,
        locationType: bp.locationType,
        locationDetails: bp.locationDetails,
        requireApproval: bp.requireApproval,
        customQuestions: (bp.customQuestions as PublicBookingPage["customQuestions"]) ?? [],
        availableWeekdays: weekdays,
      };
      current = {
        startAt: booking.startAt.toISOString(),
        status: booking.status,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        inviteePhone: booking.inviteePhone,
      };
    }
  } catch {
    page = null;
  }

  if (!page || !current) return notAvailable;

  return (
    <Shell>
      <RescheduleClient
        page={page}
        bookingId={params.bookingId}
        token={params.token}
        currentStartAt={current.startAt}
        currentStatus={current.status}
        inviteeName={current.inviteeName}
        inviteeEmail={current.inviteeEmail}
        inviteePhone={current.inviteePhone}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="kobia-crm min-h-screen w-full" style={{ backgroundColor: "var(--kb-surface-grey)", padding: "48px 16px" }}>
      <div
        className="mx-auto rounded"
        style={{
          maxWidth: "760px",
          backgroundColor: "var(--kb-surface)",
          border: "1px solid var(--kb-border)",
          borderRadius: "var(--kb-radius)",
          boxShadow: "var(--kb-shadow-modal)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
