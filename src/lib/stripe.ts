/**
 * Stripe client + Price ID map for KOBIA's own subscriptions.
 * Cycle 1 Week 2.
 *
 * IMPORTANT: This handles KOBIA charging accountant firms.
 * KOBIA's clients charging their customers is Cycle 3 (different code path).
 */
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  // Don't throw at import time during build — just at runtime use
  console.warn("STRIPE_SECRET_KEY not set — billing routes will fail.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia",
  appInfo: {
    name: "KOBIA.AI",
    version: "0.1.0",
  },
});

/**
 * Map TenantTier → Stripe Price ID.
 * Set these env vars from Stripe Dashboard → Products → [tier] → Price ID.
 */
export const TIER_PRICE_MAP = {
  SOLO: process.env.STRIPE_PRICE_SOLO || "",
  FIRM: process.env.STRIPE_PRICE_FIRM || "",
  FIRM_PLUS: process.env.STRIPE_PRICE_FIRM_PLUS || "",
} as const;

export type PaidTier = keyof typeof TIER_PRICE_MAP;

export function priceIdForTier(tier: PaidTier): string {
  const priceId = TIER_PRICE_MAP[tier];
  if (!priceId) {
    throw new Error(`No Stripe Price ID configured for tier ${tier}. Set STRIPE_PRICE_${tier} env var.`);
  }
  return priceId;
}

/**
 * Reverse map: Stripe Price ID → TenantTier.
 * Used by webhook handler to translate subscription updates back to our tier enum.
 */
export function tierForPriceId(priceId: string): PaidTier | null {
  const entry = (Object.entries(TIER_PRICE_MAP) as [PaidTier, string][]).find(
    ([, id]) => id === priceId
  );
  return entry ? entry[0] : null;
}

/** Stripe status → our SubStatus enum (uppercased with underscores) */
export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  return status.toUpperCase().replace(/-/g, "_");
}
