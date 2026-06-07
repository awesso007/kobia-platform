/*
 * Public site sub-page (Sprint 17). Unauthenticated. Resolves the tenant, loads
 * the published site by slug and the published page by page slug, and renders it
 * with the block renderer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { Metadata } from "next";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { getPublicPage } from "@/lib/sites/queries";
import { resolvePublicTenant } from "../../public-tenant";
import { SiteRenderer } from "../../SiteRenderer";

export const dynamic = "force-dynamic";

type Params = { params: { siteSlug: string; pageSlug: string }; searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const resolved = await resolvePublicTenant(searchParams);
  if (!resolved) return { title: "Not available" };
  try {
    const db = getTenantPrisma(schemaNameForSlug(resolved.tenantSlug));
    const result = await getPublicPage(db, params.siteSlug, params.pageSlug);
    if (!result) return { title: "Not available" };
    return {
      title: result.page.seoTitle ?? result.page.title ?? result.site.name,
      description: result.page.seoDescription ?? undefined,
    };
  } catch {
    return { title: "Not available" };
  }
}

export default async function PublicSitePage({ params, searchParams }: Params) {
  const resolved = await resolvePublicTenant(searchParams);
  if (!resolved) return <NotAvailable />;
  try {
    const db = getTenantPrisma(schemaNameForSlug(resolved.tenantSlug));
    const result = await getPublicPage(db, params.siteSlug, params.pageSlug);
    if (!result) return <NotAvailable />;
    return <SiteRenderer site={result.site} page={result.page} tenantSlug={resolved.tenantSlug} />;
  } catch {
    return <NotAvailable />;
  }
}

function NotAvailable() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
      <p style={{ fontSize: 16, color: "#333" }}>This page is not available.</p>
      <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>The link may be unpublished or incorrect.</p>
    </div>
  );
}
