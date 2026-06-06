/*
 * Meeting rooms settings (Sprint 12). Lists MeetingRoom rows with inline CRUD
 * and an active toggle. Per-room calendar is reachable from the calendar module
 * by filtering on the room; this page focuses on room management.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { RoomsManager, type RoomRow } from "./RoomsManager";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  try {
    const { db } = getTenantDb();
    const rooms = await db.meetingRoom.findMany({
      include: { _count: { select: { bookings: true } } },
      orderBy: { name: "asc" },
    });
    const rows: RoomRow[] = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      location: r.location,
      capacity: r.capacity,
      color: r.color,
      active: r.active,
      bookingCount: r._count.bookings,
    }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <RoomsManager rooms={rows} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
