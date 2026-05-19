/**
 * Billing settings page (Cycle 1 Week 2 shell).
 * Server component — reads subscription state and renders tier cards.
 */
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { BillingClient } from "./BillingClient";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { checkout?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN"].includes(auth.role)) {
    redirect(`/${params.tenant}/dashboard`);
  }

  const subscription = await db.subscription.findUnique({
    where: { tenantId: auth.tenant.id },
  });

  const checkoutStatus = searchParams.checkout;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing</h1>
      <p className="mt-1 text-sm text-slate-600">
        Manage your subscription and payment method.
      </p>

      {checkoutStatus === "success" && (
        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Subscription activated.</p>
          <p className="mt-1">It can take a few seconds for the status below to refresh while Stripe finalizes the webhook.</p>
        </div>
      )}
      {checkoutStatus === "cancel" && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Checkout was cancelled. Your plan is unchanged.
        </div>
      )}

      <BillingClient
        tenantSlug={params.tenant}
        currentTier={auth.tenant.tier}
        hasSubscription={!!subscription}
        subscriptionStatus={subscription?.status ?? null}
        currentPeriodEnd={subscription?.currentPeriodEnd?.toISOString() ?? null}
        trialEnd={subscription?.trialEnd?.toISOString() ?? null}
        cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
      />
    </div>
  );
}
