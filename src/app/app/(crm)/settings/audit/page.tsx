import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { AuditLog } from "./AuditLog";
import { listAuditEntries } from "./queries";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const get = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  try {
    const data = await listAuditEntries({
      entityType: get("entityType"),
      action: get("action"),
      actor: get("actor"),
      from: get("from"),
      to: get("to"),
      page: get("page") ? Number(get("page")) : 1,
    });

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <AuditLog
          rows={data.rows}
          total={data.total}
          page={data.page}
          pageCount={data.pageCount}
          actors={data.actors}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
