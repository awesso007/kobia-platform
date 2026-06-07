/*
 * Site pages list / manager (Sprint 17). Lists a site's pages with add, publish,
 * set-home, and delete via the client PagesManager.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { pagesForSite } from "../../queries";
import { PageHeader, SiteTabs, PagesManager } from "../../SitesUI";

export const dynamic = "force-dynamic";

export default async function SitePagesPage({ params }: { params: { siteId: string } }) {
  try {
    const data = await pagesForSite(params.siteId);
    if (!data) notFound();
    const { site, pages } = data;
    return (
      <div className="p-6">
        <PageHeader title={`${site.name} pages`} subtitle="Add, publish, and order the pages in this site." />
        <SiteTabs siteId={site.id} active="pages" />
        <PagesManager
          siteId={site.id}
          initialPages={pages.map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            published: p.published,
            order: p.order,
            blockCount: p.blockCount,
            isHome: p.isHome,
          }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
