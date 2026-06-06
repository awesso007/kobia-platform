/*
 * Calendar sync settings (Sprint 12). Lists external calendars (Google/Outlook
 * stubs + ICS subscriptions), offers a Connect stub for OAuth providers, and an
 * ICS subscription form that creates an EXTERNAL_ICS calendar and fetches it.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { CalendarSyncManager, type ExternalCalendarRow } from "./CalendarSyncManager";

export const dynamic = "force-dynamic";

export default async function CalendarSyncPage() {
  try {
    const { db } = getTenantDb();
    const cals = await db.calendar.findMany({
      where: { type: { in: ["EXTERNAL_GOOGLE", "EXTERNAL_OUTLOOK", "EXTERNAL_ICS"] } },
      orderBy: { name: "asc" },
    });
    const rows: ExternalCalendarRow[] = cals.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      externalUrl: c.externalUrl,
      lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
    }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <CalendarSyncManager calendars={rows} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
