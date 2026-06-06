/*
 * Calendar module (Sprint 12). Server component loads the current month's
 * window of events plus the calendars, members, contacts, and rooms the drawer
 * needs, then hands off to CalendarClient for the Day/Week/Month/Agenda views.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import {
  listCalendars,
  listEvents,
  getMembersLite,
  listContactsLite,
  listRooms,
} from "@/lib/calendar/queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { CalendarClient } from "./CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  try {
    // Load a wide window (prev/this/next month) so view switches feel instant.
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    const [calendars, events, members, contacts, rooms] = await Promise.all([
      listCalendars(),
      listEvents(from, to),
      getMembersLite(),
      listContactsLite(),
      listRooms(false),
    ]);

    return (
      <CalendarClient
        calendars={calendars}
        events={events}
        members={members}
        contacts={contacts}
        rooms={rooms}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
