import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { BillingClient } from "./BillingClient";
import { TIERS, getTier, tierLimit } from "@/lib/tier-config";

export const dynamic = "force-dynamic";

// Friendly labels for feature gate redirects.
const GATE_LABELS: Record<string, { title: string; desc: string; suggested: string }> = {
  mortgage: {
    title: "Mortgage module is on Firm and Firm+",
    desc: "Upgrade to access loan origination, borrower CRM, and RESPA/TRID compliance.",
    suggested: "FIRM",
  },
  realestate: {
    title: "Real Estate module is on Firm and Firm+",
    desc: "Upgrade to manage listings, transactions, commissions, and DRE/NMLS compliance.",
    suggested: "FIRM",
  },
  payroll: {
    title: "Payroll requires a paid plan",
    desc: "Solo, Firm, and Firm+ all include payroll. Upgrade to start running payroll.",
    suggested: "SOLO",
  },
  multi_entity: {
    title: "You've hit your entity limit",
    desc: "Your current plan has a cap on the number of entities. Upgrade to add more client books.",
    suggested: "FIRM",
  },
  api_access: {
    title: "API access is on Firm+",
    desc: "Programmatic access requires the Firm+ plan.",
    suggested: "FIRM_PLUS",
  },
  white_label: {
    title: "Custom branding is on paid plans",
    desc: "Upgrade to Solo or higher to hide the KOBIA badge and apply your logo + colors.",
    suggested: "SOLO",
  },
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { checkout?: string; gate?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN"].includes(auth.role)) {
    redirect(`/${params.tenant}/dashboard`);
  }

  const [subscription, entityCount] = await Promise.all([
    db.subscription.findUnique({ where: { tenantId: auth.tenant.id } }),
    db.entity.count({ where: { tenantId: auth.tenant.id } }),
  ]);

  const currentTierDef = getTier(auth.tenant.tier);
  const entityLimit = tierLimit(auth.tenant.tier, "multi_entity");
  const entityLimitLabel = entityLimit === Infinity ? "Unlimited" : `${entityLimit}`;
  const entityUsagePct =
    entityLimit === Infinity ? 0 : Math.min(100, Math.round((entityCount / entityLimit) * 100));

  const gate = searchParams.gate;
  const gateInfo = gate ? GATE_LABELS[gate] : null;

  const checkoutStatus = searchParams.checkout;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing</h1>
        <p className="mt-1 text-sm text-slate-600">
          {auth.tenant.name} · Manage your subscription, payment method, and plan limits.
        </p>
      </div>

      {gateInfo && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">{gateInfo.title}</p>
          <p className="mt-1 text-sm text-amber-800">{gateInfo.desc}</p>
          <p className="mt-2 text-xs text-amber-700">
            Suggested plan: <span className="font-semibold">{getTier(gateInfo.suggested as never)?.label ?? gateInfo.suggested}</span>
          </p>
        </div>
      )}

      {checkoutStatus === "success" && (
        <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Subscription activated.</p>
          <p className="mt-1">It can take a few seconds for the status below to refresh while Stripe finalizes the webhook.</p>
        </div>
      )}
      {checkoutStatus === "cancel" && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Checkout was cancelled. Your plan is unchanged.
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {/* Current Plan card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current plan</p>
          <div className="mt-1 flex items-baseline gap-2">
            <h2 className="text-2xl font-bold text-slate-900">{currentTierDef?.label ?? auth.tenant.tier}</h2>
            <span className="text-sm text-slate-500">{currentTierDef?.priceLabel ?? ""}</span>
          </div>
          {subscription ? (
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <div>
                Status: <span className="font-medium text-slate-900">{subscription.status}</span>
              </div>
              {subscription.status === "TRIALING" && subscription.trialEnd && (
                <div>Trial ends {subscription.trialEnd.toLocaleDateString()}</div>
              )}
              {subscription.status === "ACTIVE" && subscription.currentPeriodEnd && (
                <div>Renews {subscription.currentPeriodEnd.toLocaleDateString()}</div>
              )}
              {subscription.cancelAtPeriodEnd && (
                <div className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Cancels at period end
                </div>
              )}
            </div>
          ) : auth.tenant.tier === "INTERNAL" ? (
            <p className="mt-3 text-sm text-slate-600">Internal tenant — no Stripe subscription.</p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No active subscription. Choose a plan below.</p>
          )}
        </div>

        {/* Usage card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Usage</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">Entities</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{entityCount}</span>
            <span className="text-sm text-slate-500">/ {entityLimitLabel}</span>
          </div>
          {entityLimit !== Infinity && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all ${
                  entityUsagePct >= 90
                    ? "bg-rose-500"
                    : entityUsagePct >= 70
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${entityUsagePct}%` }}
              />
            </div>
          )}
          {entityLimit !== Infinity && entityCount >= entityLimit && (
            <p className="mt-3 text-xs text-rose-600">
              At limit. Upgrade to add more entities.
            </p>
          )}
        </div>
      </div>

      <BillingClient
        tenantSlug={params.tenant}
        currentTier={auth.tenant.tier}
        hasSubscription={!!subscription}
        plans={TIERS.map((t) => ({
          key: t.key,
          label: t.label,
          price: t.price,
          priceLabel: t.priceLabel,
          tagline: t.tagline,
          highlights: t.highlights,
          recommended: t.recommended ?? false,
        }))}
        suggestedTier={gateInfo?.suggested ?? null}
      />
    </div>
  );
}
