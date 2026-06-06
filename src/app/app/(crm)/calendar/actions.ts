"use server";

/*
 * Calendar server actions (Sprint 12). All DB access goes through getTenantDb().
 * Each mutating action enforces requirePermission, dispatches automations,
 * reindexes search, and notifies internal attendees. CalendarEvent is not a CRM
 * audited entity (auditWrite only covers the 4 CRM types) so we skip auditWrite
 * here by design, mirroring the Tasks/Projects module.
 *
 * Event invites: internal attendees (Membership clerkUserId) get an in-app
 * notification; external Contact attendees with an email get an email invite if
 * the tenant has a usable EmailAccount.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/send";
import { DEFAULT_REMINDERS } from "@/lib/calendar/shared";

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export type AttendeeInput = {
  clerkUserId?: string | null;
  contactId?: string | null;
  email: string;
  name?: string | null;
  isOptional?: boolean;
};

export type EventInput = {
  calendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  locationUrl?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  timezone?: string;
  status?: string;
  visibility?: string;
  recurrenceRule?: string | null;
  colorOverride?: string | null;
  relatedRecordType?: string | null;
  relatedRecordId?: string | null;
  reminders?: { minutesBefore: number; channel: "INAPP" | "EMAIL" }[];
  attendees?: AttendeeInput[];
  roomIds?: string[];
};

/** Notify internal attendees + email external Contact attendees. */
async function dispatchInvites(
  db: ReturnType<typeof getTenantDb>["db"],
  event: { id: string; title: string; startAt: Date },
  attendees: AttendeeInput[],
  organizerClerkUserId: string | null,
): Promise<void> {
  const when = event.startAt.toISOString();
  for (const a of attendees) {
    if (a.clerkUserId && a.clerkUserId !== organizerClerkUserId) {
      await notify(a.clerkUserId, {
        type: "EVENT_INVITE",
        title: `Invitation: ${event.title}`,
        body: `Starts ${when}`,
        linkUrl: `/app/calendar?event=${event.id}`,
      }).catch(() => {});
    }
  }

  // External Contact invites by email (best-effort).
  const externalEmails = attendees.filter((a) => !a.clerkUserId && a.email).map((a) => a.email);
  if (externalEmails.length === 0) return;
  const account = await db.emailAccount
    .findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
    .catch(() => null);
  if (!account) return;
  const html = `<p>You are invited to <strong>${event.title}</strong>.</p><p>Starts ${when}.</p>`;
  for (const to of externalEmails) {
    await sendEmail({ accountId: account.id, to: [to], subject: `Invitation: ${event.title}`, html }, db).catch(() => {});
  }
}

export async function createEvent(input: EventInput): Promise<string> {
  await requirePermission("record:create");
  const title = input.title?.trim();
  if (!title) throw new Error("Event title is required.");
  if (!input.calendarId) throw new Error("A calendar is required.");
  const { db } = getTenantDb();
  const organizer = currentUserId();

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const reminders = input.reminders && input.reminders.length ? input.reminders : DEFAULT_REMINDERS;

  const event = await db.calendarEvent.create({
    data: {
      calendarId: input.calendarId,
      title,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      locationUrl: input.locationUrl?.trim() || null,
      startAt,
      endAt,
      allDay: !!input.allDay,
      timezone: input.timezone || "UTC",
      status: (input.status ?? "CONFIRMED") as never,
      visibility: (input.visibility ?? "PUBLIC") as never,
      organizerClerkUserId: organizer,
      recurrenceRule: input.recurrenceRule?.trim() || null,
      colorOverride: input.colorOverride || null,
      relatedRecordType: (input.relatedRecordType || null) as never,
      relatedRecordId: input.relatedRecordId || null,
      source: "MANUAL" as never,
      reminders: reminders as never,
    },
  });

  const attendees = input.attendees ?? [];
  if (attendees.length) {
    await db.eventAttendee.createMany({
      data: attendees.map((a) => ({
        eventId: event.id,
        clerkUserId: a.clerkUserId || null,
        contactId: a.contactId || null,
        email: a.email,
        name: a.name || null,
        response: (a.clerkUserId === organizer ? "ACCEPTED" : "NEEDS_ACTION") as never,
        isOrganizer: a.clerkUserId === organizer,
        isOptional: !!a.isOptional,
      })),
    });
  }

  const roomIds = input.roomIds ?? [];
  if (roomIds.length) {
    await db.roomBooking.createMany({
      data: roomIds.map((roomId) => ({ roomId, eventId: event.id })),
      skipDuplicates: true,
    });
  }

  await dispatchInvites(db, { id: event.id, title, startAt }, attendees, organizer);
  await dispatchAutomation({ type: "EVENT_CREATED", entityType: "EVENT", entityId: event.id });
  await reindex(db, "EVENT", event.id);
  revalidatePath("/app/calendar");
  return event.id;
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  await requirePermission("record:update");
  const title = input.title?.trim();
  if (!title) throw new Error("Event title is required.");
  const { db } = getTenantDb();
  const organizer = currentUserId();

  await db.calendarEvent.update({
    where: { id },
    data: {
      calendarId: input.calendarId,
      title,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      locationUrl: input.locationUrl?.trim() || null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      allDay: !!input.allDay,
      timezone: input.timezone || "UTC",
      status: (input.status ?? "CONFIRMED") as never,
      visibility: (input.visibility ?? "PUBLIC") as never,
      recurrenceRule: input.recurrenceRule?.trim() || null,
      colorOverride: input.colorOverride || null,
      relatedRecordType: (input.relatedRecordType || null) as never,
      relatedRecordId: input.relatedRecordId || null,
      ...(input.reminders ? { reminders: input.reminders as never } : {}),
    },
  });

  if (input.attendees) {
    await db.eventAttendee.deleteMany({ where: { eventId: id } });
    if (input.attendees.length) {
      await db.eventAttendee.createMany({
        data: input.attendees.map((a) => ({
          eventId: id,
          clerkUserId: a.clerkUserId || null,
          contactId: a.contactId || null,
          email: a.email,
          name: a.name || null,
          response: (a.clerkUserId === organizer ? "ACCEPTED" : "NEEDS_ACTION") as never,
          isOrganizer: a.clerkUserId === organizer,
          isOptional: !!a.isOptional,
        })),
      });
    }
  }

  if (input.roomIds) {
    await db.roomBooking.deleteMany({ where: { eventId: id } });
    if (input.roomIds.length) {
      await db.roomBooking.createMany({
        data: input.roomIds.map((roomId) => ({ roomId, eventId: id })),
        skipDuplicates: true,
      });
    }
  }

  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "EVENT", entityId: id });
  await reindex(db, "EVENT", id);
  revalidatePath("/app/calendar");
}

/** Lightweight reposition used by drag-move / resize in the grid. */
export async function moveEvent(id: string, startAt: string, endAt: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.calendarEvent.update({
    where: { id },
    data: { startAt: new Date(startAt), endAt: new Date(endAt) },
  });
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "EVENT", entityId: id, changedFields: ["startAt", "endAt"] });
  revalidatePath("/app/calendar");
}

export async function cancelEvent(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const event = await db.calendarEvent.update({
    where: { id },
    data: { status: "CANCELED" as never },
    include: { attendees: true },
  });
  const organizer = event.organizerClerkUserId;
  for (const a of event.attendees) {
    if (a.clerkUserId && a.clerkUserId !== organizer) {
      await notify(a.clerkUserId, {
        type: "EVENT_INVITE",
        title: `Canceled: ${event.title}`,
        body: `This event was canceled.`,
        linkUrl: `/app/calendar?event=${event.id}`,
      }).catch(() => {});
    }
  }
  await dispatchAutomation({ type: "FIELD_CHANGED", entityType: "EVENT", entityId: id, changedFields: ["status"] });
  await reindex(db, "EVENT", id);
  revalidatePath("/app/calendar");
}

export async function deleteEvent(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.calendarEvent.delete({ where: { id } });
  await removeFromIndex(db, "EVENT", id);
  revalidatePath("/app/calendar");
}

export async function createCalendar(input: {
  name: string;
  color?: string;
  type?: string;
  visibility?: string;
  isDefault?: boolean;
}): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Calendar name is required.");
  const { db } = getTenantDb();
  const owner = currentUserId();

  if (input.isDefault) {
    await db.calendar.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }

  const cal = await db.calendar.create({
    data: {
      name,
      color: input.color || "#1d77bd",
      type: (input.type ?? "PERSONAL") as never,
      visibility: (input.visibility ?? "PRIVATE") as never,
      isDefault: !!input.isDefault,
      ownerClerkUserId: owner,
    },
  });
  revalidatePath("/app/calendar");
  return cal.id;
}

/** Set an attendee response from the UI (accept / decline / maybe). */
export async function setAttendeeResponse(attendeeId: string, response: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.eventAttendee.update({ where: { id: attendeeId }, data: { response: response as never } });
  revalidatePath("/app/calendar");
}
