/*
 * Public booking page (Sprint 12). Unauthenticated, slug-gated. Resolves the
 * tenant from a validated `?t=<slug>` query param (same pattern as the public
 * web-to-lead form and quote view), loads the active BookingPage by its slug,
 * and renders the 3-step scheduling client (pick date / pick slot / details).
 *
 * Slot computation runs server-side via getBookingSlots in the booking POST
 * endpoint; this page hands the client the page config + a calendar of days
 * that have at least one availability window so the picker can disable empties.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { BookingClient, type PublicBookingPage } from "./BookingClient";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tParam = Array.isArray(searchParams.t) ? searchParams.t[0] : searchParams.t;
  const tenantSlug = sanitizeSlug(tParam);

  const notAvailable = (
    <Shell>
      <div className="p-8 text-center">
        <p className="text-base font-medium" style={{ color: "var(--kb-text-primary)" }}>This booking page is not available.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>The link may be inactive or incorrect.</p>
      </div>
    </Shell>
  );

  if (!tenantSlug) return notAvailable;

  let data: PublicBookingPage | null = null;
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const page = await db.bookingPage.findUnique({
      where: { slug: params.slug },
      include: { availability: { select: { dayOfWeek: true } } },
    });
    if (page && page.active) {
      const weekdays = Array.from(new Set(page.availability.map((a) => a.dayOfWeek))).sort();
      data = {
        tenantSlug,
        slug: page.slug,
        name: page.name,
        description: page.description,
        durationMinutes: page.durationMinutes,
        minNoticeMinutes: page.minNoticeMinutes,
        maxAdvanceDays: page.maxAdvanceDays,
        timezone: page.timezone,
        color: page.color,
        locationType: page.locationType,
        locationDetails: page.locationDetails,
        requireApproval: page.requireApproval,
        customQuestions: (page.customQuestions as PublicBookingPage["customQuestions"]) ?? [],
        availableWeekdays: weekdays,
      };
    }
  } catch {
    data = null;
  }

  if (!data) return notAvailable;

  return (
    <Shell>
      <BookingClient page={data} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="kobia-crm min-h-screen w-full"
      style={{ backgroundColor: "var(--kb-surface-grey)", padding: "48px 16px" }}
    >
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
