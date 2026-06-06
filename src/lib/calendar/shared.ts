/*
 * Client-safe calendar constants + pure helpers (Sprint 12). No server-only
 * imports (no getTenantDb / next/headers) so both the calendar UI and the
 * server actions can import it.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export const CALENDAR_TYPES = [
  "PERSONAL",
  "TEAM",
  "RESOURCE",
  "EXTERNAL_GOOGLE",
  "EXTERNAL_OUTLOOK",
  "EXTERNAL_ICS",
] as const;
export type CalendarTypeKind = (typeof CALENDAR_TYPES)[number];

export const CALENDAR_VISIBILITIES = ["PRIVATE", "TEAM", "TENANT"] as const;

export const EVENT_STATUSES = ["CONFIRMED", "TENTATIVE", "CANCELED"] as const;
export const EVENT_VISIBILITIES = ["PUBLIC", "PRIVATE", "CONFIDENTIAL"] as const;

export const ATTENDEE_RESPONSES = ["NEEDS_ACTION", "ACCEPTED", "DECLINED", "TENTATIVE"] as const;
export const ATTENDEE_RESPONSE_LABELS: Record<string, string> = {
  NEEDS_ACTION: "No response",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  TENTATIVE: "Maybe",
};

export const BOOKING_LOCATION_TYPES = ["PHONE", "VIDEO_LINK", "IN_PERSON", "CUSTOM"] as const;
export const BOOKING_LOCATION_LABELS: Record<string, string> = {
  PHONE: "Phone call",
  VIDEO_LINK: "Video link",
  IN_PERSON: "In person",
  CUSTOM: "Custom",
};

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELED", "RESCHEDULED"] as const;

export const RELATED_RECORD_TYPES = ["LEAD", "DEAL", "CONTACT", "COMPANY", "PROJECT", "TASK"] as const;

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LABELS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const RECURRENCE_PRESETS = [
  { value: "", label: "Does not repeat" },
  { value: "FREQ=DAILY", label: "Daily" },
  { value: "FREQ=WEEKLY", label: "Weekly" },
  { value: "FREQ=MONTHLY", label: "Monthly" },
] as const;

export type ReminderChannel = "INAPP" | "EMAIL";
export type Reminder = { minutesBefore: number; channel: ReminderChannel };
export const DEFAULT_REMINDERS: Reminder[] = [{ minutesBefore: 15, channel: "INAPP" }];

export type CustomQuestion = { id: string; label: string; type: "text" | "textarea"; required: boolean };

/** Slug-safe check (lowercase letters, digits, hyphens; 1-50 chars). */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug);
}

/** Derive a URL slug from a free-text name. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/^-+|-+$/g, "");
}

/** Minutes-since-midnight to "HH:MM" 24h string. */
export function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" to minutes-since-midnight. Returns null on malformed input. */
export function hhmmToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Format minutes-since-midnight as a friendly 12h label (e.g. "9:00 AM"). */
export function minutesToLabel(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Start of the local day for a date. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Sunday-anchored start of the week containing d. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

/** Add n days to a date (new instance). */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Two [start,end) intervals overlap? */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
