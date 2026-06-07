/*
 * Public sites tenant resolution (Sprint 17, server-only). Mirrors the
 * /p/[slug] landing-page pattern: resolve the tenant from a validated
 * `?t=<slug>` / `?tenant=` query param, falling back to the kb-tenant cookie,
 * then to the request hostname via a custom-domain lookup.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { cookies, headers } from "next/headers";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { resolveSiteSlugForDomain } from "@/lib/sites/queries";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return SLUG_RE.test(slug) ? slug : null;
}

export function resolveTenantSlug(searchParams: Record<string, string | string[] | undefined>): string | null {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const fromQuery = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  if (fromQuery) return fromQuery;
  return sanitizeSlug(cookies().get("kb-tenant")?.value);
}

/**
 * Resolve the tenant for a public sites request. Tries the explicit tenant
 * param/cookie first; when absent, attempts to map the request hostname to a
 * site via a custom domain (best-effort, defaults to "acme" otherwise).
 */
export async function resolvePublicTenant(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<{ tenantSlug: string; siteSlugForHost: string | null } | null> {
  const explicit = resolveTenantSlug(searchParams);
  if (explicit) return { tenantSlug: explicit, siteSlugForHost: null };

  // Fall back to "acme" in the v0.1 alpha, then try host-based custom domain
  // resolution against that tenant. Full edge middleware is a follow-up.
  const tenantSlug = "acme";
  try {
    const host = headers().get("host")?.split(":")[0] ?? "";
    if (host) {
      const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
      const siteSlug = await resolveSiteSlugForDomain(db, host);
      if (siteSlug) return { tenantSlug, siteSlugForHost: siteSlug };
    }
  } catch {
    // ignore, fall through to default
  }
  return { tenantSlug, siteSlugForHost: null };
}
