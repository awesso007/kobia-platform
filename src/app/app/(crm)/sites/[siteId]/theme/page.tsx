/*
 * Site theme editor (Sprint 17). Edits the per-site theme tokens (colors,
 * spacing, radius) saved on the Site row and applied to the public renderer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { siteDetail } from "../../queries";
import { PageHeader, SiteTabs, ThemeEditor } from "../../SitesUI";

export const dynamic = "force-dynamic";

export default async function SiteThemePage({ params }: { params: { siteId: string } }) {
  try {
    const data = await siteDetail(params.siteId);
    if (!data) notFound();
    const { site } = data;
    return (
      <div className="p-6">
        <PageHeader title={`${site.name} theme`} subtitle="Colors and spacing applied to the public site." />
        <SiteTabs siteId={site.id} active="theme" />
        <ThemeEditor siteId={site.id} site={{ theme: site.theme, name: site.name }} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
