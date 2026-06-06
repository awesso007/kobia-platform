/*
 * Workspace settings (Sprint 5). Edit the tenant display name, theme colors,
 * default timezone, and logo URL. The slug is shown read-only (it is the schema
 * identity).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { getPlatformDb } from "@/lib/db/platform";
import { DEFAULT_THEME, type TenantTheme } from "@/lib/tenancy/theme";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { WorkspaceClient, type WorkspaceSummary } from "./WorkspaceClient";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  try {
    getTenantDb();
    const slug = headers().get("x-tenant-id") ?? "";
    const reg = slug ? await getPlatformDb().tenantRegistry.findUnique({ where: { slug } }) : null;
    const theme = ((reg?.theme as TenantTheme | null) ?? DEFAULT_THEME);

    const summary: WorkspaceSummary = {
      slug,
      displayName: reg?.displayName ?? "",
      primary: theme.primary ?? DEFAULT_THEME.primary,
      accent: theme.accent ?? DEFAULT_THEME.accent,
      timezone: reg?.timezone ?? "",
      logoUrl: reg?.logoUrl ?? "",
    };

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <WorkspaceClient summary={summary} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
