/**
 * Stripe webhook handler.
 *
 * Subscribes to: customer.subscription.{created,updated,deleted}, invoice.payment_failed
 * Updates Subscription model + Tenant.tier accordingly.
 *
 * SETUP:
 *   1. In Stripe Dashboard → Developers → Webhooks → Add endpoint:
 *      URL: https://kobia-platform.vercel.app/api/webhooks/stripe
 *      Events: customer.subscription.*, invoice.payment_failed
 *   2. Copy signing secret → STRIPE_WEBHOOK_SECRET env var in Vercel
 *   3. Local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe, tierForPriceId, mapStripeStatus } from "@/lib/stripe";
import { db } from "@/lib/db";
import { provisionTenantFromPending } from "@/app/actions/signup-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`Webhook signature verification failed: ${msg}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Unhandled event — return 200 so Stripe doesn't retry
        console.log(`Unhandled webhook event: ${event.type}`);
    }
  } catch (err) {
    console.error(`Webhook handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Self-serve signup: payment succeeded — provision the tenant from PendingTenant.
 * Idempotent via provisionTenantFromPending (checks provisionedTenantId).
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const pendingId = session.metadata?.pendingTenantId;
  if (!pendingId) {
    // Not a signup checkout (e.g. existing customer adding seat) — ignore.
    return;
  }

  const pending = await db.pendingTenant.findUnique({ where: { id: pendingId } });
  if (!pending) {
    console.error(`checkout.session.completed: PendingTenant ${pendingId} not found`);
    return;
  }

  // Attach Stripe customer ID to pending before provisioning so it carries over.
  const customerId = typeof session.customer === "string" ? session.customer : null;
  if (customerId && pending.stripeCustomerId !== customerId) {
    await db.pendingTenant.update({
      where: { id: pending.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const tenant = await provisionTenantFromPending(pending.id);

  // Paid tier — hide KOBIA brand per Lock EEEE, attach stripeCustomerId
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      stripeCustomerId: customerId ?? undefined,
      hideKobiaBrand: pending.tier !== "FREE" && pending.tier !== "ENTRY",
    },
  });
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  // Resolve tenantId from either subscription metadata (legacy) or pendingTenantId metadata (signup flow).
  let tenantId = sub.metadata.tenantId;
  if (!tenantId && sub.metadata.pendingTenantId) {
    const pending = await db.pendingTenant.findUnique({
      where: { id: sub.metadata.pendingTenantId },
      select: { provisionedTenantId: true },
    });
    tenantId = pending?.provisionedTenantId ?? undefined;
  }
  if (!tenantId && typeof sub.customer === "string") {
    const tenant = await db.tenant.findUnique({
      where: { stripeCustomerId: sub.customer },
      select: { id: true },
    });
    tenantId = tenant?.id;
  }
  if (!tenantId) {
    console.error("Subscription missing tenantId / pendingTenantId / customer match:", sub.id);
    return;
  }

  const priceId = sub.items.data[0]?.price.id;
  if (!priceId) {
    console.error("Subscription missing price ID:", sub.id);
    return;
  }

  const tier = tierForPriceId(priceId);
  if (!tier) {
    console.error("Unknown price ID:", priceId);
    return;
  }

  const status = mapStripeStatus(sub.status) as
    | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID"
    | "INCOMPLETE" | "INCOMPLETE_EXPIRED" | "PAUSED";

  await db.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      status,
      tier,
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    },
    update: {
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      status,
      tier,
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    },
  });

  // Promote tenant tier only when subscription is active or trialing.
  // On past_due/canceled keep current tier until grace period ends.
  // tier from tierForPriceId() is always a paid tier (SOLO/FIRM/FIRM_PLUS) — hide KOBIA brand per Lock EEEE.
  if (status === "ACTIVE" || status === "TRIALING") {
    await db.tenant.update({
      where: { id: tenantId },
      data: { tier, hideKobiaBrand: true },
    });
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const tenantId = sub.metadata.tenantId;
  if (!tenantId) return;

  await db.subscription.updateMany({
    where: { tenantId },
    data: { status: "CANCELED", canceledAt: new Date() },
  });

  // Downgrade to FREE on hard cancel (Lock EEEE re-shows KOBIA brand)
  await db.tenant.update({
    where: { id: tenantId },
    data: { tier: "FREE", hideKobiaBrand: false },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;

  await db.subscription.updateMany({
    where: { stripeSubscriptionId: subId },
    data: { status: "PAST_DUE" },
  });

  // TODO Cycle 1 Week 3: trigger Resend email to tenant owner
  console.log(`Payment failed for subscription ${subId} — owner email TODO`);
}
