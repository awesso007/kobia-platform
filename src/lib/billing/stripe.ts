/*
 * billing/stripe.ts - Sprint 5 Stripe wrapper for KOBIA tenant subscriptions.
 *
 * Distinct from the legacy src/lib/stripe.ts (which bills accountant firms in
 * the hidden accounting product). This module is tenant-registry aware: it maps
 * a tenant slug to its Stripe customer and creates Checkout / Billing Portal
 * sessions for plan upgrades.
 *
 * Configuration is OPTIONAL: if STRIPE_SECRET_KEY is not set, isStripeConfigured()
 * returns false and getStripe() throws StripeNotConfiguredError. Callers check
 * isStripeConfigured() first and render a "Stripe not configured" state instead
 * of crashing. We never invent keys.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Stripe from "stripe";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.");
    this.name = "StripeNotConfiguredError";
  }
}

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new StripeNotConfiguredError();
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
      appInfo: { name: "KOBIA CRM", version: "0.1.0" },
    });
  }
  return cached;
}

/** Origin for redirect URLs (Checkout success/cancel, Portal return). */
export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_ROOT_DOMAIN ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}` : "https://kobia.ai")
  );
}
