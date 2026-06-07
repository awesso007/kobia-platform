/*
 * Site analytics (Sprint 17). Aggregates pageviews, clicks, and form submits
 * recorded by the public /api/sites/track endpoint, plus a top-pages table.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { analyticsForSite } from "../../queries";
import { PageHeader, Card, SiteTabs, EmptyState, Th, Td } from "../../SitesUI";
import { fmtNumber } from "@/lib/sites/site-utils";

export const dynamic = "force-dynamic";

export default async function SiteAnalyticsPage({ params }: { params: { siteId: string } }) {
  try {
    const data = await analyticsForSite(params.siteId);
    if (!data) notFound();
    const { site, summary } = data;
    return (
      <div className="p-6">
        <PageHeader title={`${site.name} analytics`} subtitle="Traffic recorded for the public site." />
        <SiteTabs siteId={site.id} active="analytics" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Pageviews" value={fmtNumber(summary.totalViews)} />
          <Stat label="Clicks" value={fmtNumber(summary.totalClicks)} />
          <Stat label="Form submits" value={fmtNumber(summary.totalFormSubmits)} />
        </div>
        <Card className="mt-4">
          <div className="px-4 py-3 text-sm font-semibold" style={{ color: "var(--kb-text-primary)", borderBottom: "1px solid var(--kb-border)" }}>
            Top pages
          </div>
          {summary.topPages.length === 0 ? (
            <EmptyState message="No traffic recorded yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Page</Th>
                  <Th>Views</Th>
                </tr>
              </thead>
              <tbody>
                {summary.topPages.map((p) => (
                  <tr key={p.pageId ?? "none"} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>{p.title}</Td>
                    <Td>{fmtNumber(p.views)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        {value}
      </p>
    </Card>
  );
}
