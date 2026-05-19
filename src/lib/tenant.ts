/**
 * Tenant resolution from subdomain or path.
 * Lock EEEE: Each tenant lives at {slug}.kobia.ai
 * In development, we use /[tenant]/* path-based routing for simplicity.
 */
import { db } from "@/lib/db";
import type { Tenant } from "@prisma/client";

/**
 * Resolve a tenant by slug.
 * Returns null if not found or inactive.
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  if (!slug || typeof slug !== "string") return null;
  const tenant = await db.tenant.findUnique({
    where: { slug: slug.toLowerCase() },
  });
  if (!tenant || !tenant.isActive) return null;
  return tenant;
}

/**
 * Whether the KOBIA "Powered by" badge should be shown for this tenant.
 * Lock EEEE: Free + Entry tiers always show. Paid tiers hide by default.
 */
export function shouldShowKobiaBrand(tenant: Tenant): boolean {
  if (tenant.tier === "FREE" || tenant.tier === "ENTRY") return true;
  return !tenant.hideKobiaBrand;
}

/**
 * Build the full URL for a tenant.
 */
export function getTenantUrl(slug: string, path = ""): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "kobia.ai";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${slug}.${root}${path}`;
}
