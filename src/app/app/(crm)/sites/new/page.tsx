/*
 * New site wizard (Sprint 17). Loads tenant themes for the picker and renders
 * the client form, which creates the site (plus an auto home page) and redirects
 * to the site dashboard.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { themesForTenant } from "../queries";
import { PageHeader, NewSiteForm } from "../SitesUI";

export const dynamic = "force-dynamic";

export default async function NewSitePage() {
  try {
    const themes = await themesForTenant();
    return (
      <div className="p-6">
        <PageHeader title="New site" subtitle="Give your site a name. We will add an empty home page to start." />
        <NewSiteForm themes={themes.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
