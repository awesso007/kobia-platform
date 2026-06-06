/*
 * Public quote view (Sprint 10). Unauthenticated, slug-gated. Resolves the
 * tenant from a validated `?t=<slug>` query param (same pattern as the public
 * web-to-lead form), loads the Quote by its unguessable publicSlug, marks it
 * VIEWED on first render, and renders a print-ready document with Accept /
 * Request changes actions wired to the public server actions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { markQuoteViewed } from "./actions";
import { PublicQuoteClient, type PublicQuoteData } from "./PublicQuoteClient";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PublicQuotePage({
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
      <p style={{ color: "var(--kb-text-secondary)" }}>This quote is not available.</p>
    </Shell>
  );

  if (!tenantSlug) return notAvailable;

  let data: PublicQuoteData | null = null;
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const quote = await db.quote.findUnique({
      where: { publicSlug: params.slug },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        template: { select: { primaryColor: true, defaultNotes: true, defaultTerms: true } },
      },
    });
    if (quote) {
      const contact = quote.contactId
        ? await db.contact.findUnique({ where: { id: quote.contactId }, select: { firstName: true, lastName: true, email: true } })
        : null;
      const company = quote.companyId
        ? await db.company.findUnique({ where: { id: quote.companyId }, select: { name: true } })
        : null;
      data = {
        tenantSlug,
        slug: quote.publicSlug,
        number: quote.number,
        title: quote.title,
        status: quote.status,
        currency: quote.currency,
        primaryColor: quote.template?.primaryColor ?? "#3b82f6",
        notes: quote.notes ?? quote.template?.defaultNotes ?? null,
        terms: quote.termsAndConditions ?? quote.template?.defaultTerms ?? null,
        expiresAt: quote.expiresAt ? quote.expiresAt.toISOString().slice(0, 10) : null,
        subtotalCents: quote.subtotalCents,
        discountCents: quote.discountCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || null : null,
        companyName: company?.name ?? null,
        lineItems: quote.lineItems.map((l) => ({
          id: l.id,
          name: l.name,
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceCents: l.unitPriceCents,
          discountPct: Number(l.discountPct),
          taxRatePct: Number(l.taxRatePct),
          lineTotalCents: l.lineTotalCents,
        })),
      };
      // Best-effort: mark VIEWED on first public render (sets viewedAt + bumps
      // status from SENT). Never blocks rendering if it fails.
      try {
        await markQuoteViewed(tenantSlug, quote.publicSlug);
      } catch {
        // ignore
      }
    }
  } catch {
    data = null;
  }

  if (!data) return notAvailable;

  return (
    <Shell>
      <PublicQuoteClient data={data} />
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
          maxWidth: "720px",
          backgroundColor: "var(--kb-surface)",
          border: "1px solid var(--kb-border)",
          borderRadius: "var(--kb-radius)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
