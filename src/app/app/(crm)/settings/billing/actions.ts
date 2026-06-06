"use server";

/*
 * Billing server actions (Sprint 5). Create a Stripe Billing Portal session or
 * a Checkout Session for a plan upgrade. Both require billing:manage and a
 * configured Stripe. When Stripe is not configured they return
 * { ok: false, reason: "not_configured" } so the UI can show a clear message
 * instead of throwing.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { getPlatformDb } from "@/lib/db/platform";
import { requirePermission } from "@/lib/rbac/require-permission";
import { isStripeConfigured, getStripe, appOrigin } from "@/lib/billing/stripe";
import { priceIdForPlan, type PlanId } from "@/lib/billing/plans";

type PortalResult = { ok: true; url: string } | { ok: false; reason: "not_configured" | "no_customer" };
type CheckoutResult = { ok: true; url: string } | { ok: false; reason: "not_configured" | "no_price" };

function activeSlug(): string | null {
  try {
    return headers().get("x-tenant-id");
  } catch {
    return null;
  }
}

export async function createPortalSession(): Promise<PortalResult> {
  await requirePermission("billing:manage");
  if (!isStripeConfigured()) return { ok: false, reason: "not_configured" };
  const slug = activeSlug();
  if (!slug) return { ok: false, reason: "no_customer" };

  const reg = await getPlatformDb().tenantRegistry.findUnique({ where: { slug }, select: { stripeCustomerId: true } });
  if (!reg?.stripeCustomerId) return { ok: false, reason: "no_customer" };

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: reg.stripeCustomerId,
    return_url: `${appOrigin()}/app/settings/billing?tenant=${slug}`,
  });
  return { ok: true, url: session.url };
}

export async function createCheckoutSession(plan: string): Promise<CheckoutResult> {
  await requirePermission("billing:manage");
  if (!isStripeConfigured()) return { ok: false, reason: "not_configured" };
  const priceId = priceIdForPlan(plan as PlanId);
  if (!priceId) return { ok: false, reason: "no_price" };
  const slug = activeSlug();

  const platform = getPlatformDb();
  const reg = slug
    ? await platform.tenantRegistry.findUnique({ where: { slug }, select: { stripeCustomerId: true, billingEmail: true } })
    : null;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: reg?.stripeCustomerId ?? undefined,
    customer_email: reg?.stripeCustomerId ? undefined : reg?.billingEmail ?? undefined,
    client_reference_id: slug ?? undefined,
    metadata: { tenantSlug: slug ?? "", plan },
    success_url: `${appOrigin()}/app/settings/billing?tenant=${slug ?? ""}&checkout=success`,
    cancel_url: `${appOrigin()}/app/settings/billing?tenant=${slug ?? ""}&checkout=cancel`,
  });
  return session.url ? { ok: true, url: session.url } : { ok: false, reason: "no_price" };
}
