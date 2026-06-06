/*
 * gates.ts - plan-gated feature flags (Sprint 5).
 *
 * A feature gate maps a capability to the minimum plan that unlocks it. The
 * active tenant's plan comes from tenant_registry. requirePlan() throws
 * PlanRequiredError when the tenant's plan is below the minimum, so callers /
 * pages can render an "Upgrade to PRO" blocker.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { getPlatformDb } from "@/lib/db/platform";
import { planRank, type PlanId } from "./plans";

export type Feature = "automations" | "report_builder" | "custom_fields" | "web_forms";

export const FEATURE_MIN_PLAN: Record<Feature, PlanId> = {
  custom_fields: "STARTER",
  web_forms: "STARTER",
  automations: "PRO",
  report_builder: "PRO",
};

export class PlanRequiredError extends Error {
  required: PlanId;
  current: PlanId;
  constructor(feature: Feature, required: PlanId, current: PlanId) {
    super(`Feature "${feature}" requires the ${required} plan (current: ${current}).`);
    this.name = "PlanRequiredError";
    this.required = required;
    this.current = current;
  }
}

/** Read the active tenant's plan from the registry. Defaults to FREE. */
export async function getActivePlan(): Promise<PlanId> {
  let slug: string | null = null;
  try {
    slug = headers().get("x-tenant-id");
  } catch {
    return "FREE";
  }
  if (!slug) return "FREE";
  try {
    const reg = await getPlatformDb().tenantRegistry.findUnique({ where: { slug }, select: { plan: true } });
    return (reg?.plan as PlanId) ?? "FREE";
  } catch {
    return "FREE";
  }
}

export async function hasFeature(feature: Feature): Promise<boolean> {
  const plan = await getActivePlan();
  return planRank(plan) >= planRank(FEATURE_MIN_PLAN[feature]);
}

/** Throw PlanRequiredError if the active tenant's plan is below the feature minimum. */
export async function requirePlan(feature: Feature): Promise<void> {
  const plan = await getActivePlan();
  const required = FEATURE_MIN_PLAN[feature];
  if (planRank(plan) < planRank(required)) {
    throw new PlanRequiredError(feature, required, plan);
  }
}
