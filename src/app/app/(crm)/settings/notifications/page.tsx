/*
 * Notification preferences (Sprint 5). Per-type toggles for in-app and email
 * delivery. Defaults: in-app on, email off (email is a v0.1 stub). Reads the
 * current user's NotificationPref rows and fills in defaults for any missing
 * type.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { auth } from "@clerk/nextjs/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { NotificationPrefsClient, type PrefRow } from "./NotificationPrefsClient";
import type { NotificationType } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

const TYPES: { type: NotificationType; label: string; description: string }[] = [
  { type: "MENTION", label: "Mentions", description: "When someone mentions you" },
  { type: "ASSIGNMENT", label: "Assignments", description: "When a record is assigned to you" },
  { type: "DUE_SOON", label: "Due soon", description: "When one of your activities is due within 24 hours" },
  { type: "AUTOMATION_RESULT", label: "Automation results", description: "When an automation you created fails" },
  { type: "SYSTEM", label: "System", description: "Important workspace and account updates" },
];

export default async function NotificationsSettingsPage() {
  try {
    getTenantDb();
    let clerkUserId: string | null = null;
    try {
      clerkUserId = auth().userId ?? null;
    } catch {
      clerkUserId = null;
    }

    const existing = clerkUserId
      ? await getTenantDb().db.notificationPref.findMany({ where: { clerkUserId } })
      : [];
    const byType = new Map(existing.map((p) => [p.type, p]));

    const rows: PrefRow[] = TYPES.map((t) => {
      const pref = byType.get(t.type as never);
      return {
        type: t.type,
        label: t.label,
        description: t.description,
        inApp: pref?.inApp ?? true,
        email: pref?.email ?? false,
      };
    });

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <NotificationPrefsClient rows={rows} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
