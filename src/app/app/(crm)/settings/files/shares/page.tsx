/*
 * File shares settings (Sprint 8). Lists every active FileShareLink in the
 * tenant with its file, password/expiry/limit state and download count, and
 * lets an admin revoke a link.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { SettingsNav } from "../../SettingsNav";
import { listShareLinks } from "../../../file-actions";
import { SharesClient } from "./SharesClient";

export const dynamic = "force-dynamic";

export default async function FileSharesPage() {
  try {
    const tenantSlug = headers().get("x-tenant-id") ?? "acme";
    const links = await listShareLinks();
    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <SharesClient links={links} tenantSlug={tenantSlug} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
