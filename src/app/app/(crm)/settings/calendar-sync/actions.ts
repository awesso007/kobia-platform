"use server";

/*
 * Calendar sync settings actions (Sprint 12). Adds an ICS subscription as an
 * EXTERNAL_ICS Calendar and fetches it immediately; the daily cron keeps it in
 * sync afterwards. Google/Outlook OAuth is stubbed until v0.4.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { syncIcsCalendar } from "@/lib/calendar/ics";

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export async function addIcsSubscription(input: { name: string; url: string; color?: string }): Promise<{ upserted: number; error?: string }> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  const url = input.url?.trim();
  if (!name) throw new Error("A calendar name is required.");
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("A valid http(s) ICS URL is required.");
  const { db } = getTenantDb();

  const calendar = await db.calendar.create({
    data: {
      name,
      color: input.color || "#828282",
      type: "EXTERNAL_ICS" as never,
      visibility: "PRIVATE" as never,
      ownerClerkUserId: currentUserId(),
      externalUrl: url,
    },
  });

  const res = await syncIcsCalendar(db, { id: calendar.id, externalUrl: url });
  revalidatePath("/app/settings/calendar-sync");
  revalidatePath("/app/calendar");
  return res;
}

export async function resyncIcsCalendar(calendarId: string): Promise<{ upserted: number; error?: string }> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const cal = await db.calendar.findUnique({ where: { id: calendarId }, select: { id: true, externalUrl: true } });
  if (!cal) throw new Error("Calendar not found.");
  const res = await syncIcsCalendar(db, cal);
  revalidatePath("/app/settings/calendar-sync");
  revalidatePath("/app/calendar");
  return res;
}

export async function removeExternalCalendar(calendarId: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.calendar.delete({ where: { id: calendarId } });
  revalidatePath("/app/settings/calendar-sync");
  revalidatePath("/app/calendar");
}
