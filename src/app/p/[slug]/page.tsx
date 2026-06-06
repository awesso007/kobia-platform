/*
 * Public landing page (Sprint 13). Unauthenticated, slug-gated. Resolves the
 * tenant from a validated `?t=<slug>` (or `?tenant=`) query param or the
 * kb-tenant cookie, loads the PUBLISHED LandingPage by slug, records a view
 * (increment viewCount + a LandingPageView row), and renders the stored HTML/CSS.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

function resolveTenant(searchParams: Record<string, string | string[] | undefined>): string | null {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const fromQuery = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  if (fromQuery) return fromQuery;
  const cookie = cookies().get("kb-tenant")?.value;
  return sanitizeSlug(cookie);
}

export default async function PublicLandingPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tenantSlug = resolveTenant(searchParams);

  const notFound = (
    <Shell>
      <p style={{ fontSize: 16, color: "#333" }}>This page is not available.</p>
      <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>The link may be unpublished or incorrect.</p>
    </Shell>
  );

  if (!tenantSlug) return notFound;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const page = await db.landingPage.findUnique({ where: { slug: params.slug } });
    if (!page || page.status !== "PUBLISHED") return notFound;

    // Record a view (best-effort). Hash the IP so we never store a raw address.
    try {
      const h = headers();
      const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
      const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;
      const visitorId = createHash("sha256").update(`${ip}|${h.get("user-agent") ?? ""}`).digest("hex").slice(0, 32);
      await db.landingPageView.create({
        data: {
          pageId: page.id,
          visitorId,
          referrer: h.get("referer") || null,
          userAgent: h.get("user-agent") || null,
          ipHash,
        },
      });
      await db.landingPage.update({ where: { id: page.id }, data: { viewCount: { increment: 1 } } });
    } catch {
      // Tracking must never break rendering.
    }

    const doc = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(
      page.metaTitle ?? page.title,
    )}</title>${page.metaDescription ? `<meta name="description" content="${escapeHtml(page.metaDescription)}" />` : ""}<style>${page.cssContent ?? ""}</style></head><body>${page.htmlContent}</body></html>`;

    return (
      <iframe
        title={page.title}
        srcDoc={doc}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
      />
    );
  } catch {
    return notFound;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
      {children}
    </div>
  );
}
