/**
 * Active-entity helpers.
 * A tenant can own multiple Entities (client books). The user picks one as
 * "active" and we remember it via cookie until they switch.
 *
 * Scoping: the cookie key is namespaced by tenant slug so switching tenants
 * doesn't leak entity ids across them.
 */
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const ACTIVE_ENTITY_COOKIE_PREFIX = "kobia_active_entity_";

export function cookieKeyForTenant(tenantSlug: string) {
  // Sanitize slug — only [a-z0-9-]+ allowed in our schema, but be defensive.
  const safe = tenantSlug.replace(/[^a-z0-9-]/gi, "_");
  return `${ACTIVE_ENTITY_COOKIE_PREFIX}${safe}`;
}

/**
 * Resolve the active entity for a tenant. Falls back to the first entity if
 * no cookie is set or the cookied id no longer exists / is inactive.
 * Returns null only if the tenant has zero active entities.
 */
export async function getActiveEntity(opts: { tenantId: string; tenantSlug: string }) {
  const cookieStore = cookies();
  const cookied = cookieStore.get(cookieKeyForTenant(opts.tenantSlug))?.value;

  if (cookied) {
    const fromCookie = await db.entity.findFirst({
      where: { id: cookied, tenantId: opts.tenantId, isActive: true },
    });
    if (fromCookie) return fromCookie;
    // cookie stale; fall through
  }

  return db.entity.findFirst({
    where: { tenantId: opts.tenantId, isActive: true },
    orderBy: { name: "asc" },
  });
}

/** All active entities for a tenant — used to populate the switcher. */
export async function listEntitiesForSwitcher(tenantId: string) {
  return db.entity.findMany({
    where: { tenantId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, industry: true, baseCurrency: true },
  });
}
