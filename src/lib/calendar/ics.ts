/*
 * ICS subscription sync (Sprint 12). Fetches a public ICS feed URL and upserts
 * CalendarEvent rows into an EXTERNAL_ICS calendar, keyed by externalId (the
 * VEVENT UID). Used by /api/cron/calendar-sync and on-save when a user adds an
 * ICS subscription in Settings > Calendar sync.
 *
 * Best-effort: a bad feed logs and returns an error rather than throwing into
 * the caller. Full Google/Outlook OAuth sync arrives in v0.4.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

type IcsEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
};

/** Fetch + parse a public ICS URL into a normalized event list. */
export async function fetchIcsEvents(url: string): Promise<{ ok: true; events: IcsEvent[] } | { ok: false; error: string }> {
  try {
    const ical = await import("node-ical");
    const data = await ical.default.async.fromURL(url);
    const events: IcsEvent[] = [];
    for (const key of Object.keys(data)) {
      const item = data[key] as Record<string, unknown>;
      if (!item || item.type !== "VEVENT") continue;
      const start = item.start as Date | undefined;
      const end = (item.end as Date | undefined) ?? (start ? new Date(start.getTime() + 3_600_000) : undefined);
      if (!start || !end) continue;
      const datetype = (item.datetype as string | undefined) ?? "date-time";
      events.push({
        uid: String(item.uid ?? key),
        summary: String(item.summary ?? "(untitled)"),
        description: item.description ? String(item.description) : null,
        location: item.location ? String(item.location) : null,
        start,
        end,
        allDay: datetype === "date",
      });
    }
    return { ok: true, events };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

/**
 * Sync one EXTERNAL_ICS calendar: fetch its externalUrl and upsert events keyed
 * by (calendarId, externalId). Returns counts. Never throws.
 */
export async function syncIcsCalendar(
  db: PrismaClient,
  calendar: { id: string; externalUrl: string | null },
): Promise<{ upserted: number; error?: string }> {
  if (!calendar.externalUrl) return { upserted: 0, error: "no url" };
  const res = await fetchIcsEvents(calendar.externalUrl);
  if (!res.ok) return { upserted: 0, error: res.error };

  let upserted = 0;
  for (const ev of res.events) {
    try {
      const existing = await db.calendarEvent.findFirst({
        where: { calendarId: calendar.id, externalId: ev.uid },
        select: { id: true },
      });
      const data = {
        calendarId: calendar.id,
        title: ev.summary,
        description: ev.description,
        location: ev.location,
        startAt: ev.start,
        endAt: ev.end,
        allDay: ev.allDay,
        source: "EXTERNAL_SYNC" as const,
        externalId: ev.uid,
      };
      if (existing) {
        await db.calendarEvent.update({ where: { id: existing.id }, data });
      } else {
        await db.calendarEvent.create({ data });
      }
      upserted++;
    } catch (err) {
      console.error("[ics] upsert failed for", ev.uid, err);
    }
  }
  await db.calendar.update({ where: { id: calendar.id }, data: { lastSyncedAt: new Date() } });
  return { upserted };
}
