/*
 * Site domains (Sprint 17). Add and remove custom domains; each gets a TXT
 * verification token. Domain resolution for the public renderer lives in the
 * sites lib (resolveSiteSlugForDomain).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { domainsForSite } from "../../queries";
import { PageHeader, SiteTabs, DomainsManager } from "../../SitesUI";

export const dynamic = "force-dynamic";

export default async function SiteDomainsPage({ params }: { params: { siteId: string } }) {
  try {
    const data = await domainsForSite(params.siteId);
    if (!data) notFound();
    const { site, domains } = data;
    return (
      <div className="p-6">
        <PageHeader title={`${site.name} domains`} subtitle="Point a custom domain at this site." />
        <SiteTabs siteId={site.id} active="domains" />
        <DomainsManager
          siteId={site.id}
          customDomain={site.customDomain}
          initialDomains={domains.map((d) => ({
            id: d.id,
            domain: d.domain,
            verified: d.verified,
            verificationToken: d.verificationToken,
          }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
