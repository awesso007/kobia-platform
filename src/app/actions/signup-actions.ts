"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { stripe, priceIdForTier } from "@/lib/stripe";
import { isPaidTier, type PaidTier } from "@/lib/tier-config";
import type { TenantTier } from "@prisma/client";

const SLUG_RE = /^[a-z][a-z0-9-]{2,30}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "billing", "blog", "dashboard", "demo", "docs",
  "help", "kobia", "login", "logout", "marketing", "pricing", "signup", "settings",
  "stripe", "support", "www", "fig",
]);

const SIGNUP_TTL_HOURS = 24;

export type StartSignupInput = {
  slug: string;
  businessName: string;
  legalName?: string;
  email: string;
  tier: TenantTier;
};

export type StartSignupResult = { ok: false; error: string } | { ok: true; redirectUrl: string };

export async function startSignup(input: StartSignupInput): Promise<StartSignupResult> {
  const slug = input.slug.toLowerCase().trim();
  const email = input.email.toLowerCase().trim();
  const businessName = input.businessName.trim();
  const legalName = input.legalName?.trim() || null;

  // Validate
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Slug must be 4-32 chars, lowercase letters/numbers/hyphens, start with a letter." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: `"${slug}" is reserved. Try another.` };
  }
  if (!businessName || businessName.length < 2) {
    return { ok: false, error: "Business name is required." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Valid email is required." };
  }

  // Check slug uniqueness against existing tenants AND pending signups
  const [existingTenant, existingPending] = await Promise.all([
    db.tenant.findUnique({ where: { slug } }),
    db.pendingTenant.findFirst({
      where: { slug, status: "PENDING", expiresAt: { gt: new Date() } },
    }),
  ]);
  if (existingTenant) {
    return { ok: false, error: `Slug "${slug}" is taken. Try another.` };
  }
  if (existingPending) {
    return { ok: false, error: `Slug "${slug}" is reserved by another signup. Try again in 24 hours or pick another.` };
  }

  const tier = input.tier;
  const expiresAt = new Date(Date.now() + SIGNUP_TTL_HOURS * 60 * 60 * 1000);

  // FREE tier: provision tenant immediately, no Stripe.
  if (tier === "FREE") {
    const pending = await db.pendingTenant.create({
      data: { slug, businessName, legalName, email, tier, expiresAt },
    });
    const tenant = await provisionTenantFromPending(pending.id);
    return { ok: true, redirectUrl: `/signup/success?tenant=${tenant.slug}` };
  }

  // Paid tiers: create PendingTenant + Stripe checkout session
  if (!isPaidTier(tier)) {
    return { ok: false, error: `Tier ${tier} is not available for self-serve signup. Contact sales.` };
  }

  const pending = await db.pendingTenant.create({
    data: { slug, businessName, legalName, email, tier, expiresAt },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL || "https://kobia-platform.vercel.app";
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceIdForTier(tier as PaidTier), quantity: 1 }],
      success_url: `${origin}/signup/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/signup/cancel?pending=${pending.id}`,
      metadata: {
        pendingTenantId: pending.id,
        slug,
        tier,
      },
      subscription_data: {
        metadata: {
          pendingTenantId: pending.id,
          slug,
          tier,
        },
      },
    });
  } catch (err) {
    // If Stripe fails (e.g. missing Price ID), mark pending as abandoned + surface error.
    await db.pendingTenant.update({
      where: { id: pending.id },
      data: { status: "ABANDONED" },
    });
    const msg = err instanceof Error ? err.message : "Failed to start checkout.";
    return { ok: false, error: `Checkout error: ${msg}` };
  }

  await db.pendingTenant.update({
    where: { id: pending.id },
    data: { stripeCheckoutId: session.id },
  });

  if (!session.url) {
    return { ok: false, error: "Stripe did not return a checkout URL. Try again." };
  }
  return { ok: true, redirectUrl: session.url };
}

/**
 * Provision a real Tenant from a PendingTenant.
 * Called by:
 *   - FREE signup (immediate)
 *   - Stripe webhook on checkout.session.completed (paid)
 * Idempotent: if already provisioned, returns the existing tenant.
 */
export async function provisionTenantFromPending(pendingId: string) {
  const pending = await db.pendingTenant.findUnique({ where: { id: pendingId } });
  if (!pending) throw new Error(`PendingTenant ${pendingId} not found`);

  if (pending.provisionedTenantId) {
    const existing = await db.tenant.findUnique({ where: { id: pending.provisionedTenantId } });
    if (existing) return existing;
  }

  // Race guard: if a tenant with this slug already exists (e.g. webhook fired twice),
  // attach to it instead of creating duplicate.
  const slugTaken = await db.tenant.findUnique({ where: { slug: pending.slug } });
  if (slugTaken) {
    await db.pendingTenant.update({
      where: { id: pending.id },
      data: { status: "COMPLETED", provisionedTenantId: slugTaken.id },
    });
    return slugTaken;
  }

  const tenant = await db.tenant.create({
    data: {
      slug: pending.slug,
      name: pending.businessName,
      legalName: pending.legalName,
      tier: pending.tier,
      stripeCustomerId: pending.stripeCustomerId,
      onboardingCompleted: false,
      onboardingStep: "industry",
      // hideKobiaBrand is set by the webhook on paid tier confirmation
    },
  });

  // NOTE: We intentionally do NOT create a default Entity here.
  // The /welcome onboarding flow creates the first entity with industry-aware COA seeding.

  await db.pendingTenant.update({
    where: { id: pending.id },
    data: { status: "COMPLETED", provisionedTenantId: tenant.id },
  });

  return tenant;
}

/** Wrapper that calls startSignup and redirects (form action) */
export async function startSignupAndRedirect(formData: FormData) {
  const result = await startSignup({
    slug: String(formData.get("slug") || ""),
    businessName: String(formData.get("businessName") || ""),
    legalName: String(formData.get("legalName") || "") || undefined,
    email: String(formData.get("email") || ""),
    tier: String(formData.get("tier") || "FREE") as TenantTier,
  });
  if (!result.ok) {
    const params = new URLSearchParams({
      error: result.error,
      tier: String(formData.get("tier") || "FREE"),
      slug: String(formData.get("slug") || ""),
      businessName: String(formData.get("businessName") || ""),
      email: String(formData.get("email") || ""),
    });
    redirect(`/signup/start?${params.toString()}`);
  }
  redirect(result.redirectUrl);
}
