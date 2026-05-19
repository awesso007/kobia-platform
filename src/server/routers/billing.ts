import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { stripe, priceIdForTier } from "@/lib/stripe";

/**
 * Billing router — KOBIA's own subscriptions (Cycle 1 Week 2).
 * Creates Stripe Checkout sessions and Customer Portal sessions.
 */
export const billingRouter = router({
  /** Get current subscription state for the tenant. */
  current: protectedProcedure.query(async ({ ctx }) => {
    const sub = await db.subscription.findUnique({
      where: { tenantId: ctx.auth.tenant.id },
    });
    return {
      tier: ctx.auth.tenant.tier,
      subscription: sub,
      isPaid: sub?.status === "ACTIVE" || sub?.status === "TRIALING",
    };
  }),

  /** Create a Stripe Checkout session for an upgrade. */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["SOLO", "FIRM", "FIRM_PLUS"]),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owners/admins can manage billing." });
      }

      const tenant = ctx.auth.tenant;
      let stripeCustomerId = tenant.stripeCustomerId;

      // Create Stripe customer on first checkout
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: ctx.auth.user.email,
          name: tenant.name,
          metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
        });
        stripeCustomerId = customer.id;
        await db.tenant.update({
          where: { id: tenant.id },
          data: { stripeCustomerId },
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [{ price: priceIdForTier(input.tier), quantity: 1 }],
        subscription_data: {
          trial_period_days: 14, // Lock JJJ — 14-day trial
          metadata: { tenantId: tenant.id, tier: input.tier },
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: true,
      });

      return { url: session.url };
    }),

  /** Create a Stripe Customer Portal session for managing subscription. */
  createPortalSession: protectedProcedure
    .input(z.object({ returnUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (!ctx.auth.tenant.stripeCustomerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No billing account yet. Subscribe first." });
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: ctx.auth.tenant.stripeCustomerId,
        return_url: input.returnUrl,
      });
      return { url: session.url };
    }),
});
