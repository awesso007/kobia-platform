import { headers } from "next/headers";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { getPlatformDb } from "@/lib/db/platform";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { BillingClient, type BillingSummary } from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  try {
    // Touch the tenant context so the page 403s consistently when unresolved.
    getTenantDb();
    const slug = headers().get("x-tenant-id");
    const reg = slug
      ? await getPlatformDb().tenantRegistry.findUnique({ where: { slug } })
      : null;

    const summary: BillingSummary = {
      plan: (reg?.plan as BillingSummary["plan"]) ?? "FREE",
      subscriptionStatus: reg?.subscriptionStatus ?? null,
      subscriptionRenewsAt: reg?.subscriptionRenewsAt?.toISOString() ?? null,
      seatsPurchased: reg?.seatsPurchased ?? 1,
      seatsUsed: reg?.seatsUsed ?? 0,
      billingEmail: reg?.billingEmail ?? null,
      stripeConfigured: isStripeConfigured(),
      hasCustomer: Boolean(reg?.stripeCustomerId),
    };

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <BillingClient summary={summary} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
