"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

const TIERS = [
  {
    id: "SOLO",
    name: "Solo Accountant",
    price: "$149",
    description: "1-20 client books, unlimited firm seats",
    features: ["Full books + reconciliation", "Invoicing + AR", "AI categorization", "Up to 20 client entities"],
  },
  {
    id: "FIRM",
    name: "Firm",
    price: "$399",
    description: "20-100 clients, includes payroll",
    features: ["Everything in Solo", "Payroll (up to 50 employees)", "Client portal", "E-sign"],
  },
  {
    id: "FIRM_PLUS",
    name: "Firm Plus",
    price: "$899",
    description: "100+ clients, multi-state, dedicated CSM",
    features: ["Unlimited clients", "Multi-state payroll", "Advanced reporting", "Dedicated CSM"],
  },
] as const;

type Props = {
  tenantSlug: string;
  currentTier: string;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export function BillingClient({
  tenantSlug,
  currentTier,
  hasSubscription,
  subscriptionStatus,
  currentPeriodEnd,
  trialEnd,
  cancelAtPeriodEnd,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Could not start checkout. Please try again.");
        setLoading(null);
      }
    },
    onError: (err) => {
      setError(err.message);
      setLoading(null);
    },
  });

  const portal = trpc.billing.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Could not open billing portal. Please try again.");
        setLoading(null);
      }
    },
    onError: (err) => {
      setError(err.message);
      setLoading(null);
    },
  });

  function handleUpgrade(tier: "SOLO" | "FIRM" | "FIRM_PLUS") {
    setError(null);
    setLoading(tier);
    const base = `${window.location.origin}/${tenantSlug}/settings/billing`;
    checkout.mutate({
      tier,
      successUrl: `${base}?checkout=success`,
      cancelUrl: `${base}?checkout=cancel`,
    });
  }

  function handleManage() {
    setError(null);
    setLoading("portal");
    const returnUrl = `${window.location.origin}/${tenantSlug}/settings/billing`;
    portal.mutate({ returnUrl });
  }

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {hasSubscription && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Current plan: {currentTier}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Status: <span className="font-medium">{subscriptionStatus}</span>
                {subscriptionStatus === "TRIALING" && trialEnd && (
                  <> · Trial ends {new Date(trialEnd).toLocaleDateString()}</>
                )}
                {subscriptionStatus === "ACTIVE" && currentPeriodEnd && (
                  <> · Renews {new Date(currentPeriodEnd).toLocaleDateString()}</>
                )}
                {cancelAtPeriodEnd && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Cancels at period end
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={handleManage}
              disabled={loading === "portal"}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading === "portal" ? "Opening..." : "Manage Billing"}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.id;
          return (
            <div
              key={tier.id}
              className={`rounded-lg border bg-white p-6 shadow-sm ${
                isCurrent ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200"
              }`}
            >
              <h3 className="text-lg font-semibold text-slate-900">{tier.name}</h3>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {tier.price}
                <span className="text-sm font-normal text-slate-500">/mo</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">{tier.description}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-green-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleUpgrade(tier.id)}
                disabled={isCurrent || loading !== null}
                className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {isCurrent ? "Current plan" : loading === tier.id ? "Loading..." : `Upgrade to ${tier.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        Need Enterprise pricing or have 200+ clients? Contact sales (coming soon).
      </p>
    </div>
  );
}
