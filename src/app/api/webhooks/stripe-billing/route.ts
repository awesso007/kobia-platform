/*
 * Sprint 5 Stripe billing webhook (tenant-registry aware).
 *
 * Separate from the legacy /api/webhooks/stripe (accounting firms). This one
 * updates public.tenant_registry subscription fields and logs every event to
 * billing_event. Verifies the signature with STRIPE_WEBHOOK_SECRET. If Stripe
 * or the secret is not configured it returns 503 "not configured" without
 * crashing the build.
 *
 * Configure in Stripe Dashboard -> Webhooks:
 *   URL: https://kobia.ai/api/webhooks/stripe-billing
 *   Events: checkout.session.completed, customer.subscription.{created,updated,deleted}
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { isStripeConfigured, getStripe } from "@/lib/billing/stripe";
import { getPlatformDb } from "@/lib/db/platform";
import { PLAN_ORDER, type PlanId } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function planFromPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const id of PLAN_ORDER) {
    const env = id === "STARTER" ? process.env.STRIPE_PRICE_STARTER : id === "PRO" ? process.env.STRIPE_PRICE_PRO : null;
    if (env && env === priceId) return id;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !secret) {
    return NextResponse.json({ ok: false, error: "Stripe billing not configured." }, { status: 503 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });

  const raw = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Signature verification failed: ${err instanceof Error ? err.message : err}` }, { status: 400 });
  }

  const platform = getPlatformDb();
  // Resolve the tenant slug from metadata / client_reference_id / customer.
  let tenantSlug: string | null = null;
  try {
    const obj = event.data.object as unknown as Record<string, unknown>;
    tenantSlug =
      ((obj.metadata as Record<string, string> | undefined)?.tenantSlug as string | undefined) ||
      (obj.client_reference_id as string | undefined) ||
      null;
  } catch {
    tenantSlug = null;
  }

  try {
    await platform.billingEvent.create({ data: { tenantId: tenantSlug, type: event.type, payload: event as unknown as object } });
  } catch (err) {
    console.error("[stripe-billing] failed to log billing event", err);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const slug = (s.metadata?.tenantSlug as string | undefined) || (s.client_reference_id ?? undefined);
        const plan = (s.metadata?.plan as PlanId | undefined) ?? null;
        if (slug) {
          await platform.tenantRegistry.updateMany({
            where: { slug },
            data: {
              stripeCustomerId: typeof s.customer === "string" ? s.customer : null,
              stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : null,
              subscriptionStatus: "active",
              ...(plan ? { plan } : {}),
            },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const plan = event.type === "customer.subscription.deleted" ? "FREE" : planFromPriceId(priceId);
        const renews = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        const where = tenantSlug ? { slug: tenantSlug } : customerId ? { stripeCustomerId: customerId } : null;
        if (where) {
          await platform.tenantRegistry.updateMany({
            where,
            data: {
              subscriptionStatus: sub.status,
              subscriptionRenewsAt: renews,
              stripeSubscriptionId: sub.id,
              ...(plan ? { plan } : {}),
            },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe-billing] handler error", err);
    return NextResponse.json({ ok: false, error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
