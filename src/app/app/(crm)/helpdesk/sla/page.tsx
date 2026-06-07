/*
 * SLA policies admin (Sprint 15). Lists policies with first-response/resolve
 * targets and lets agents add or remove them via the client SlaManager.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { listSlaPolicies } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { HelpdeskTabs, PageHeader, SlaManager } from "../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function SlaPage() {
  try {
    const policies = await listSlaPolicies();
    return (
      <div className="p-6">
        <PageHeader
          title="SLA policies"
          subtitle="First-response and resolution targets, optionally business-hours only."
        />
        <HelpdeskTabs active="/app/helpdesk/sla" />
        <SlaManager
          policies={policies.map((p) => ({
            id: p.id,
            name: p.name,
            firstResponseMinutes: p.firstResponseMinutes,
            resolveMinutes: p.resolveMinutes,
            businessHoursOnly: p.businessHoursOnly,
          }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
