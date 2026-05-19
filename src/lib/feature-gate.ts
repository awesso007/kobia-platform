import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { tierHasFeature, tierLimit, type FeatureKey } from "@/lib/tier-config";

/**
 * Server-side feature gate. Call from page/route handlers.
 * If tenant lacks feature, redirects to /[slug]/settings/billing?gate=<feature>.
 */
export async function requireFeature(tenantSlug: string, feature: FeatureKey): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { tier: true },
  });
  if (!tenant) redirect("/signup");
  if (!tierHasFeature(tenant.tier, feature)) {
    redirect(`/${tenantSlug}/settings/billing?gate=${feature}`);
  }
}

/**
 * Returns true if tenant has feature, false otherwise. Non-throwing.
 * Use for conditional rendering in pages.
 */
export async function canUseFeature(tenantSlug: string, feature: FeatureKey): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { tier: true },
  });
  if (!tenant) return false;
  return tierHasFeature(tenant.tier, feature);
}

/**
 * Check usage against a numeric limit (e.g. multi_entity).
 * Returns { allowed, limit, used }.
 */
export async function checkLimit(
  tenantSlug: string,
  feature: FeatureKey,
  currentUsage: number,
): Promise<{ allowed: boolean; limit: number; used: number }> {
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { tier: true },
  });
  if (!tenant) return { allowed: false, limit: 0, used: currentUsage };
  const limit = tierLimit(tenant.tier, feature);
  return {
    allowed: currentUsage < limit,
    limit,
    used: currentUsage,
  };
}
