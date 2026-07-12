/*
 * Workgroups list (Sprint 22). Server component: loads my groups + discoverable
 * groups and renders the tabbed list. Interactions go through /api/workgroups/**.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { loadWorkgroupsPage } from "./queries";
import { WorkgroupsList } from "./WorkgroupsUI";

export const dynamic = "force-dynamic";

export default async function WorkgroupsPage() {
  try {
    const { mine, discover } = await loadWorkgroupsPage();
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>Workgroups</h1>
        <WorkgroupsList mine={mine} discover={discover} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
