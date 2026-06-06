/*
 * Marketing overview (Sprint 13). Server component: shows headline counts and
 * quick links into segments, broadcasts, campaigns, and landing pages.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { Users2, Send, GitBranch, LayoutTemplate } from "lucide-react";
import { getMarketingOverview } from "./queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { PageHeader, Card } from "./MarketingUI";

export const dynamic = "force-dynamic";

export default async function MarketingOverviewPage() {
  try {
    const counts = await getMarketingOverview();
    const tiles = [
      { href: "/app/marketing/segments", label: "Segments", value: counts.segments, icon: Users2, desc: "Audiences resolved from contacts and leads" },
      { href: "/app/marketing/broadcasts", label: "Broadcasts", value: counts.broadcasts, icon: Send, desc: "One-off email and SMS sends" },
      { href: "/app/marketing/campaigns", label: "Campaigns", value: counts.campaigns, icon: GitBranch, desc: "Multi-step drip sequences" },
      { href: "/app/marketing/landing-pages", label: "Landing pages", value: counts.landingPages, icon: LayoutTemplate, desc: "Published pages at /p/<slug>" },
    ];
    return (
      <div className="p-6">
        <PageHeader title="Marketing" subtitle="Segments, broadcasts, drip campaigns, and landing pages." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tiles.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href}>
                <Card className="p-5 transition hover:shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={18} style={{ color: "var(--kb-primary)" }} />
                      <span className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
                        {t.label}
                      </span>
                    </div>
                    <span className="text-2xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
                      {t.value}
                    </span>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                    {t.desc}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
        <p className="mt-6 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          {counts.unsubscribes} address{counts.unsubscribes === 1 ? "" : "es"} on the unsubscribe list. Broadcasts skip these automatically.
        </p>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
