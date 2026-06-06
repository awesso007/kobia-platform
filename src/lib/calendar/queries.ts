/*
 * Calendar read queries (Sprint 12). Server-only. All access through
 * getTenantDb(). Used by the calendar module + settings pages. Dates are
 * serialized to ISO strings at the boundary so they cross to client components
 * cleanly.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";

export type CalendarLite = {
  id: string;
  name: string;
  color: string;
  type: string;
  visibility: string;
  isDefault: boolean;
  ownerClerkUserId: string | null;
  externalUrl: string | null;
  lastSyncedAt: string | null;
};

export type EventLite = {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  locationUrl: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  status: string;
  visibility: string;
  organizerClerkUserId: string | null;
  recurrenceRule: string | null;
  colorOverride: string | null;
  relatedRecordType: string | null;
  relatedRecordId: string | null;
  source: string;
  attendees: Array<{
    id: string;
    clerkUserId: string | null;
    contactId: string | null;
    email: string;
    name: string | null;
    response: string;
    isOrganizer: boolean;
    isOptional: boolean;
  }>;
  roomIds: string[];
  reminders: unknown;
};

export type MemberLite = { clerkUserId: string; displayName: string | null; email: string | null };

export async function listCalendars(): Promise<CalendarLite[]> {
  const { db } = getTenantDb();
  const rows = await db.calendar.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    type: c.type,
    visibility: c.visibility,
    isDefault: c.isDefault,
    ownerClerkUserId: c.ownerClerkUserId,
    externalUrl: c.externalUrl,
    lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
  }));
}

/** Events overlapping [from, to). */
export async function listEvents(from: Date, to: Date): Promise<EventLite[]> {
  const { db } = getTenantDb();
  const rows = await db.calendarEvent.findMany({
    where: { startAt: { lt: to }, endAt: { gt: from } },
    include: { attendees: true, roomBookings: { select: { roomId: true } } },
    orderBy: { startAt: "asc" },
  });
  return rows.map(serializeEvent);
}

export async function getEvent(id: string): Promise<EventLite | null> {
  const { db } = getTenantDb();
  const r = await db.calendarEvent.findUnique({
    where: { id },
    include: { attendees: true, roomBookings: { select: { roomId: true } } },
  });
  return r ? serializeEvent(r) : null;
}

type EventRow = {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  locationUrl: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  status: string;
  visibility: string;
  organizerClerkUserId: string | null;
  recurrenceRule: string | null;
  colorOverride: string | null;
  relatedRecordType: string | null;
  relatedRecordId: string | null;
  source: string;
  reminders: unknown;
  attendees: Array<{
    id: string;
    clerkUserId: string | null;
    contactId: string | null;
    email: string;
    name: string | null;
    response: string;
    isOrganizer: boolean;
    isOptional: boolean;
  }>;
  roomBookings: Array<{ roomId: string }>;
};

function serializeEvent(r: EventRow): EventLite {
  return {
    id: r.id,
    calendarId: r.calendarId,
    title: r.title,
    description: r.description,
    location: r.location,
    locationUrl: r.locationUrl,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    allDay: r.allDay,
    status: r.status,
    visibility: r.visibility,
    organizerClerkUserId: r.organizerClerkUserId,
    recurrenceRule: r.recurrenceRule,
    colorOverride: r.colorOverride,
    relatedRecordType: r.relatedRecordType,
    relatedRecordId: r.relatedRecordId,
    source: r.source,
    attendees: r.attendees.map((a) => ({
      id: a.id,
      clerkUserId: a.clerkUserId,
      contactId: a.contactId,
      email: a.email,
      name: a.name,
      response: a.response,
      isOrganizer: a.isOrganizer,
      isOptional: a.isOptional,
    })),
    roomIds: r.roomBookings.map((rb) => rb.roomId),
    reminders: r.reminders,
  };
}

export async function getMembersLite(): Promise<MemberLite[]> {
  const { db } = getTenantDb();
  return db.membership.findMany({ select: { clerkUserId: true, displayName: true, email: true } });
}

export type ContactLite = { id: string; name: string; email: string | null };

export async function listContactsLite(): Promise<ContactLite[]> {
  const { db } = getTenantDb();
  const rows = await db.contact.findMany({
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  return rows.map((c) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Contact",
    email: c.email,
  }));
}

export type RoomLite = { id: string; name: string; location: string | null; capacity: number | null; color: string; active: boolean };

export async function listRooms(includeInactive = true): Promise<RoomLite[]> {
  const { db } = getTenantDb();
  const rows = await db.meetingRoom.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, location: r.location, capacity: r.capacity, color: r.color, active: r.active }));
}

export type BookingPageRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  timezone: string;
  active: boolean;
  color: string;
  locationType: string;
  locationDetails: string | null;
  requireApproval: boolean;
  redirectUrl: string | null;
  customQuestions: unknown;
  ownerClerkUserId: string | null;
  bookingCount: number;
  availability: Array<{ id: string; dayOfWeek: number; startMinutes: number; endMinutes: number }>;
};

export async function listBookingPages(): Promise<BookingPageRow[]> {
  const { db } = getTenantDb();
  const rows = await db.bookingPage.findMany({
    include: { availability: { orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }] }, _count: { select: { bookings: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeBookingPage);
}

export async function getBookingPage(id: string): Promise<BookingPageRow | null> {
  const { db } = getTenantDb();
  const r = await db.bookingPage.findUnique({
    where: { id },
    include: { availability: { orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }] }, _count: { select: { bookings: true } } },
  });
  return r ? serializeBookingPage(r) : null;
}

type BookingPageDbRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  timezone: string;
  active: boolean;
  color: string;
  locationType: string;
  locationDetails: string | null;
  requireApproval: boolean;
  redirectUrl: string | null;
  customQuestions: unknown;
  ownerClerkUserId: string | null;
  availability: Array<{ id: string; dayOfWeek: number; startMinutes: number; endMinutes: number }>;
  _count: { bookings: number };
};

function serializeBookingPage(r: BookingPageDbRow): BookingPageRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    durationMinutes: r.durationMinutes,
    bufferBeforeMinutes: r.bufferBeforeMinutes,
    bufferAfterMinutes: r.bufferAfterMinutes,
    minNoticeMinutes: r.minNoticeMinutes,
    maxAdvanceDays: r.maxAdvanceDays,
    timezone: r.timezone,
    active: r.active,
    color: r.color,
    locationType: r.locationType,
    locationDetails: r.locationDetails,
    requireApproval: r.requireApproval,
    redirectUrl: r.redirectUrl,
    customQuestions: r.customQuestions,
    ownerClerkUserId: r.ownerClerkUserId,
    bookingCount: r._count.bookings,
    availability: r.availability.map((a) => ({ id: a.id, dayOfWeek: a.dayOfWeek, startMinutes: a.startMinutes, endMinutes: a.endMinutes })),
  };
}
