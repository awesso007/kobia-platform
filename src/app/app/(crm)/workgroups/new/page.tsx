/*
 * Create a workgroup (Sprint 22). Server component: renders the create form,
 * which POSTs to /api/workgroups and redirects to the new group on success.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NoTenantError, getTenantDb } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { NewGroupForm } from "../WorkgroupsUI";

export const dynamic = "force-dynamic";

export default async function NewWorkgroupPage() {
  try {
    getTenantDb();
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>New workgroup</h1>
        <NewGroupForm />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
