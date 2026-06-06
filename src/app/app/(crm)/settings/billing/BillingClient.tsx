"use client";

/*
 * Billing settings. Shows the current plan, seats, renewal, and billing email;
 * a "Manage subscription" button (Stripe Billing Portal); and per-plan Upgrade
 * buttons (Stripe Checkout). When Stripe is not configured, all actions render
 * a "Stripe not configured" notice instead of erroring.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { PLANS, PLAN_ORDER, planRank, type PlanId } from "@/lib/billing/plans";
import { createPortalSession, createCheckoutSession } from "./actions";

export type BillingSummary = {
  plan: PlanId;
  subscriptionStatus: string | null;
  subscriptionRenewsAt: string | null;
  seatsPurchased: number;
  seatsUsed: number;
  billingEmail: string | null;
  stripeConfigured: boolean;
  hasCustomer: boolean;
};

export function BillingClient({ summary }: { summary: BillingSummary }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const current = PLANS[summary.plan];

  function go(fn: () => Promise<{ ok: boolean; url?: string; reason?: string }>) {
    setNotice(null);
    start(async () => {
      try {
        const res = await fn();
        if (res.ok && res.url) {
          window.location.href = res.url;
          return;
        }
        if (res.reason === "not_configured") setNotice("Stripe is not configured. Set STRIPE_SECRET_KEY (and STRIPE_PRICE_* for paid plans) to enable billing.");
        else if (res.reason === "no_customer") setNotice("No Stripe customer yet for this workspace. Upgrade to a paid plan first.");
        else if (res.reason === "no_price") setNotice("This plan has no Stripe price configured. Set the STRIPE_PRICE_* env var.");
        else setNotice("Could not start the billing session.");
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Billing action failed.");
      }
    });
  }

  return (
    <div className="max-w-3xl">
      {!summary.stripeConfigured && (
        <div className="mb-4 rounded p-3 text-sm" style={{ backgroundColor: "#fff8e1", border: "1px solid var(--kb-warning)", color: "var(--kb-text-primary)" }}>
          Stripe is not configured. Plans below are display-only until STRIPE_SECRET_KEY and STRIPE_PRICE_* are set.
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded p-3 text-sm" style={{ backgroundColor: "var(--kb-surface-grey)", border: "1px solid var(--kb-border)" }}>{notice}</div>
      )}

      <div className="mb-5 rounded p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Current plan</div>
            <div style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600 }}>{current.name} <span style={{ color: "var(--kb-text-secondary)", fontWeight: 400 }}>{current.priceLabel}</span></div>
            <div className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              Status: {summary.subscriptionStatus ?? "none"} - Seats {summary.seatsUsed}/{summary.seatsPurchased}
              {summary.subscriptionRenewsAt ? ` - Renews ${new Date(summary.subscriptionRenewsAt).toLocaleDateString()}` : ""}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>Billing email: {summary.billingEmail ?? "-"}</div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => go(() => createPortalSession())}
            className="rounded px-3 py-1.5 text-sm"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
          >
            Manage subscription
          </button>
        </div>
      </div>

      <h2 className="mb-3" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600 }}>Plans</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === summary.plan;
          const isUpgrade = planRank(id) > planRank(summary.plan);
          return (
            <div key={id} className="rounded p-4" style={{ backgroundColor: "var(--kb-surface)", border: isCurrent ? "2px solid var(--kb-primary)" : "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
              <div className="flex items-baseline justify-between">
                <div style={{ fontWeight: 600 }}>{plan.name}</div>
                <div style={{ color: "var(--kb-text-secondary)" }}>{plan.priceLabel}</div>
              </div>
              <div className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{plan.blurb}</div>
              <ul className="mt-2 space-y-1 text-sm">
                {plan.features.map((f) => <li key={f}>- {f}</li>)}
              </ul>
              <div className="mt-3">
                {isCurrent ? (
                  <span className="text-sm" style={{ color: "var(--kb-primary)", fontWeight: 600 }}>Current plan</span>
                ) : id === "ENTERPRISE" ? (
                  <a href="mailto:sales@kobia.ai" className="text-sm" style={{ color: "var(--kb-primary)" }}>Contact sales</a>
                ) : isUpgrade ? (
                  <button type="button" disabled={pending} onClick={() => go(() => createCheckoutSession(id))} className="rounded px-3 py-1.5 text-sm text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>
                    Upgrade to {plan.name}
                  </button>
                ) : (
                  <span className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Included below your plan</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
