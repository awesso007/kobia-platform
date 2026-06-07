/*
 * Site dashboard / overview (Sprint 17). Shows status, the publish/view/delete
 * actions, and a summary of pages. Server component; mutations run via the
 * client SiteActionsBar.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { siteDetail } from "../queries";
import { PageHeader, Card, SiteTabs, SiteActionsBar, StatusBadge } from "../SitesUI";
import { fmtDate } from "@/lib/sites/site-utils";

export const dynamic = "force-dynamic";

export default async function SiteOverviewPage({ params }: { params: { siteId: string } }) {
  try {
    const data = await siteDetail(params.siteId);
    if (!data) notFound();
    const { site, pages } = data;
    const published = pages.filter((p) => p.published).length;
    return (
      <div className="p-6">
        <PageHeader
          title={site.name}
          subtitle={`/s/${site.slug}`}
          action={<SiteActionsBar siteId={site.id} slug={site.slug} published={site.published} />}
        />
        <SiteTabs siteId={site.id} active="overview" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Status" value={<StatusBadge published={site.published} />} />
          <Stat label="Pages" value={`${pages.length} (${published} published)`} />
          <Stat label="Last updated" value={fmtDate(site.updatedAt)} />
        </div>
        {site.description ? (
          <Card className="mt-4 p-4">
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              {site.description}
            </p>
          </Card>
        ) : null}
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
      <p className="mt-1 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        {value}
      </p>
    </Card>
  );
}
