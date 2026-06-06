/*
 * plans.ts - KOBIA v0.1 subscription plans (Sprint 5).
 *
 * Plan ids match tenant_registry.plan. Stripe Price IDs are read from env per
 * plan (STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO); they are empty until the user
 * sets them, in which case Checkout for that plan reports "not configured".
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export type PlanId = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";

export type Plan = {
  id: PlanId;
  name: string;
  priceLabel: string;
  seats: number | null; // null = unlimited
  blurb: string;
  features: string[];
  /** Env var holding the Stripe Price ID for this plan, if any. */
  priceEnv?: string;
};

export const PLANS: Record<PlanId, Plan> = {
  FREE: {
    id: "FREE",
    name: "Free",
    priceLabel: "$0",
    seats: 1,
    blurb: "For trying KOBIA solo.",
    features: ["1 seat", "Leads, Deals, Contacts, Companies", "Activities"],
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    priceLabel: "$29/mo",
    seats: 5,
    blurb: "For small teams.",
    features: ["5 seats", "Everything in Free", "Custom fields and tags", "Web-to-Lead forms"],
    priceEnv: "STRIPE_PRICE_STARTER",
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceLabel: "$99/mo",
    seats: 25,
    blurb: "For growing teams that automate.",
    features: ["25 seats", "Everything in Starter", "Automations engine", "Custom report builder"],
    priceEnv: "STRIPE_PRICE_PRO",
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    priceLabel: "Custom",
    seats: null,
    blurb: "For organizations at scale.",
    features: ["Unlimited seats", "Everything in Pro", "Priority support", "Custom onboarding"],
  },
};

export const PLAN_ORDER: PlanId[] = ["FREE", "STARTER", "PRO", "ENTERPRISE"];

export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}

/** Stripe Price ID for a plan, or null if the plan is not Stripe-billable / not configured. */
export function priceIdForPlan(id: PlanId): string | null {
  const env = PLANS[id].priceEnv;
  if (!env) return null;
  const val = process.env[env];
  return val && val.length > 0 ? val : null;
}
