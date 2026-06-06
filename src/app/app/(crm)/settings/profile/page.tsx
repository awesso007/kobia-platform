/*
 * Profile settings (Sprint 7). Per-user telephony preferences: call forwarding
 * number, call-notification toggle, and default outbound number. Backed by the
 * UserPreference model.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { getProfilePrefs } from "./actions";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  try {
    getTenantDb();
    const { prefs, numbers } = await getProfilePrefs();
    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <ProfileClient prefs={prefs} numbers={numbers} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
