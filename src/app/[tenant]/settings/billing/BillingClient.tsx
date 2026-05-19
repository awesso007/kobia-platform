"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

type PlanCard = {
  key: string;
  label: string;
  price: number | null;
  priceLabel: string;
  tagline: string;
  highlights: string[];
  recommended: boolean;
};

type Props = {
  tenantSlug: string;
  currentTier: string;
  hasSubscription: boolean;
  plans: PlanCard[];
  suggestedTier: string | null;
};

type PaidTier = "SOLO" | "FIRM" | "FIRM_PLUS";

export function BillingClient({
  tenantSlug,
  currentTier,
  hasSubscription,
  plans,
  suggestedTier,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
      else {
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
      if (data.url) window.location.href = data.url;
      else {
        setError("Could not open billing portal. Please try again.");
        setLoading(null);
      }
    },
    onError: (err) => {
      setError(err.message);
      setLoading(null);
    },
  });

  function handleUpgrade(tier: string) {
    if (tier === "FREE") return; // free is signup-only path
    setError(null);
    setLoading(tier);
    const base = `${window.location.origin}/${tenantSlug}/settings/billing`;
    checkout.mutate({
      tier: tier as PaidTier,
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
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {hasSubscription && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Manage subscription</p>
              <p className="text-xs text-slate-600">
                Update card, download invoices, change billing email, or cancel.
              </p>
            </div>
            <button
              onClick={handleManage}
              disabled={loading === "portal"}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {loading === "portal" ? "Opening…" : "Open billing portal"}
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
          {hasSubscription ? "Change plan" : "Choose a plan"}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const isCurrent = currentTier === p.key;
            const isSuggested = suggestedTier === p.key;
            const isFree = p.key === "FREE";
            return (
              <div
                key={p.key}
                className={`relative flex flex-col rounded-xl border bg-white p-5 ${
                  isSuggested
                    ? "border-amber-400 ring-2 ring-amber-200"
                    : p.recommended
                      ? "border-slate-900 ring-1 ring-slate-900"
                      : "border-slate-200"
                }`}
              >
                {isSuggested && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Suggested
                  </span>
                )}
                {p.recommended && !isSuggested && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Popular
                  </span>
                )}
                <h3 className="text-base font-semibold text-slate-900">{p.label}</h3>
                <div className="mt-1 mb-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {p.price === 0 ? "Free" : `$${p.price}`}
                  </span>
                  {p.price !== 0 && p.price !== null && (
                    <span className="text-sm text-slate-500">/mo</span>
                  )}
                </div>
                <p className="mb-3 text-xs text-slate-600">{p.tagline}</p>
                <ul className="mb-4 flex-1 space-y-1.5 text-xs text-slate-600">
                  {p.highlights.slice(0, 4).map((h) => (
                    <li key={h} className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-emerald-600">✓</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(p.key)}
                  disabled={isCurrent || isFree || loading !== null}
                  className={`mt-auto w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isCurrent
                      ? "border border-slate-200 bg-slate-50 text-slate-400"
                      : isFree
                        ? "border border-slate-200 bg-white text-slate-400"
                        : isSuggested
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                  } disabled:opacity-60`}
                >
                  {isCurrent
                    ? "Current plan"
                    : isFree
                      ? "Free tier"
                      : loading === p.key
                        ? "Loading…"
                        : hasSubscription
                          ? `Switch to ${p.label}`
                          : `Upgrade to ${p.label}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Need Enterprise pricing, SSO, or custom integrations? Email{" "}
        <a href="mailto:hello@kobia.ai" className="underline">
          hello@kobia.ai
        </a>
        .
      </p>
    </div>
  );
}
