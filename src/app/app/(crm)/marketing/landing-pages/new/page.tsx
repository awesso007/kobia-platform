/*
 * New landing page (Sprint 13). Renders the editor in create mode.
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { LandingPageEditor } from "../LandingPageEditor";

export const dynamic = "force-dynamic";

export default function NewLandingPagePage() {
  try {
    const { tenantId } = getTenantDb();
    return <LandingPageEditor tenantSlug={tenantId} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
