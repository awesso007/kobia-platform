"use client";

/*
 * Event drawer (Sprint 12). Slide-in 480px panel (fullscreen on mobile) for
 * creating and editing a CalendarEvent. Handles title, location type, start/end
 * /all-day, recurrence preset, attendee typeahead (members + contacts), room
 * select, related-record link, description, visibility/status/calendar, plus a
 * "Find a time" conflict hint computed client-side from the loaded events.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { CalendarLite, EventLite, MemberLite, ContactLite, RoomLite } from "@/lib/calendar/queries";
import {
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
  RECURRENCE_PRESETS,
  RELATED_RECORD_TYPES,
  BOOKING_LOCATION_LABELS,
} from "@/lib/calendar/shared";
import { createEvent, updateEvent, cancelEvent, deleteEvent, type AttendeeInput } from "./actions";

type LocationKind = "in_person" | "video" | "phone" | "custom";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export type DrawerSeed = {
  event?: EventLite;
  startAt?: string;
  endAt?: string;
};

export function EventDrawer({
  seed,
  calendars,
  members,
  contacts,
  rooms,
  events,
  onClose,
  onSaved,
}: {
  seed: DrawerSeed;
  calendars: CalendarLite[];
  members: MemberLite[];
  contacts: ContactLite[];
  rooms: RoomLite[];
  events: EventLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = seed.event;
  const writableCalendars = calendars.filter((c) => !c.type.startsWith("EXTERNAL_"));
  const defaultCal =
    existing?.calendarId ?? writableCalendars.find((c) => c.isDefault)?.id ?? writableCalendars[0]?.id ?? "";

  const [title, setTitle] = useState(existing?.title ?? "");
  const [calendarId, setCalendarId] = useState(defaultCal);
  const [locationKind, setLocationKind] = useState<LocationKind>("in_person");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [locationUrl, setLocationUrl] = useState(existing?.locationUrl ?? "");
  const [start, setStart] = useState(
    existing ? toLocalInput(existing.startAt) : seed.startAt ? toLocalInput(seed.startAt) : toLocalInput(new Date().toISOString()),
  );
  const [end, setEnd] = useState(
    existing ? toLocalInput(existing.endAt) : seed.endAt ? toLocalInput(seed.endAt) : toLocalInput(new Date(Date.now() + 3_600_000).toISOString()),
  );
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);
  const [recurrence, setRecurrence] = useState(existing?.recurrenceRule ?? "");
  const [status, setStatus] = useState(existing?.status ?? "CONFIRMED");
  const [visibility, setVisibility] = useState(existing?.visibility ?? "PUBLIC");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [relatedType, setRelatedType] = useState(existing?.relatedRecordType ?? "");
  const [relatedId, setRelatedId] = useState(existing?.relatedRecordId ?? "");
  const [roomIds, setRoomIds] = useState<string[]>(existing?.roomIds ?? []);
  const [attendees, setAttendees] = useState<AttendeeInput[]>(
    existing
      ? existing.attendees
          .filter((a) => !a.isOrganizer)
          .map((a) => ({ clerkUserId: a.clerkUserId, contactId: a.contactId, email: a.email, name: a.name }))
      : [],
  );
  const [attendeeQuery, setAttendeeQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const suggestions = useMemo(() => {
    const q = attendeeQuery.trim().toLowerCase();
    if (!q) return [] as { key: string; label: string; add: AttendeeInput }[];
    const taken = new Set(attendees.map((a) => a.clerkUserId || a.contactId || a.email));
    const out: { key: string; label: string; add: AttendeeInput }[] = [];
    for (const m of members) {
      const label = m.displayName || m.email || m.clerkUserId;
      if (label.toLowerCase().includes(q) && !taken.has(m.clerkUserId)) {
        out.push({ key: `m:${m.clerkUserId}`, label: `${label} (team)`, add: { clerkUserId: m.clerkUserId, email: m.email ?? "", name: m.displayName } });
      }
    }
    for (const c of contacts) {
      if ((c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)) && !taken.has(c.id) && c.email) {
        out.push({ key: `c:${c.id}`, label: `${c.name} (contact)`, add: { contactId: c.id, email: c.email, name: c.name } });
      }
    }
    return out.slice(0, 6);
  }, [attendeeQuery, members, contacts, attendees]);

  // Find-a-time: count internal-attendee conflicts in the chosen window.
  const conflictCount = useMemo(() => {
    const s = new Date(fromLocalInput(start)).getTime();
    const e = new Date(fromLocalInput(end)).getTime();
    const internalIds = new Set(attendees.map((a) => a.clerkUserId).filter(Boolean) as string[]);
    if (internalIds.size === 0 || !(s < e)) return 0;
    let n = 0;
    for (const ev of events) {
      if (existing && ev.id === existing.id) continue;
      if (ev.status === "CANCELED") continue;
      const evS = new Date(ev.startAt).getTime();
      const evE = new Date(ev.endAt).getTime();
      if (evS < e && s < evE) {
        const hasInternal = ev.attendees.some((a) => a.clerkUserId && internalIds.has(a.clerkUserId));
        if (hasInternal || (ev.organizerClerkUserId && internalIds.has(ev.organizerClerkUserId))) n++;
      }
    }
    return n;
  }, [start, end, attendees, events, existing]);

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!calendarId) {
      setError("Pick a calendar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        calendarId,
        title: title.trim(),
        description,
        location: locationKind === "in_person" ? location : locationKind === "phone" ? location : null,
        locationUrl: locationKind === "video" || locationKind === "custom" ? locationUrl : null,
        startAt: fromLocalInput(start),
        endAt: fromLocalInput(end),
        allDay,
        status,
        visibility,
        recurrenceRule: recurrence || null,
        relatedRecordType: relatedType || null,
        relatedRecordId: relatedType ? relatedId || null : null,
        attendees,
        roomIds,
      };
      if (existing) await updateEvent(existing.id, payload);
      else await createEvent(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save event.");
      setBusy(false);
    }
  }

  async function onCancelEvent() {
    if (!existing) return;
    setBusy(true);
    try {
      await cancelEvent(existing.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteEvent(existing.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
      setBusy(false);
    }
  }

  const field = "w-full rounded border px-2 py-1.5 text-sm";
  const fieldStyle = { borderColor: "var(--kb-border)", borderRadius: "var(--kb-radius-sm)" } as const;
  const labelCls = "block text-xs font-medium mb-1";
  const labelStyle = { color: "var(--kb-text-secondary)" } as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative h-full w-full max-w-[480px] overflow-y-auto bg-white shadow-xl"
        style={{ boxShadow: "var(--kb-shadow-modal)" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--kb-text-primary)" }}>
            {existing ? "Edit event" : "New event"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <label className={labelCls} style={labelStyle}>Title</label>
            <input ref={titleRef} className={field} style={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title" />
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Location</label>
            <div className="mb-1 flex flex-wrap gap-1">
              {(["in_person", "video", "phone", "custom"] as LocationKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLocationKind(k)}
                  className="rounded px-2 py-0.5 text-xs"
                  style={{
                    border: "1px solid var(--kb-border)",
                    backgroundColor: locationKind === k ? "var(--kb-primary)" : "transparent",
                    color: locationKind === k ? "#fff" : "var(--kb-text-secondary)",
                  }}
                >
                  {k === "in_person" ? BOOKING_LOCATION_LABELS.IN_PERSON : k === "video" ? BOOKING_LOCATION_LABELS.VIDEO_LINK : k === "phone" ? BOOKING_LOCATION_LABELS.PHONE : BOOKING_LOCATION_LABELS.CUSTOM}
                </button>
              ))}
            </div>
            {locationKind === "video" || locationKind === "custom" ? (
              <input className={field} style={fieldStyle} value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder={locationKind === "video" ? "https://meet..." : "Details / link"} />
            ) : (
              <input className={field} style={fieldStyle} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={locationKind === "phone" ? "Phone number" : "Address or room"} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls} style={labelStyle}>Start</label>
              <input type="datetime-local" className={field} style={fieldStyle} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>End</label>
              <input type="datetime-local" className={field} style={fieldStyle} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
          </label>

          <div>
            <label className={labelCls} style={labelStyle}>Repeat</label>
            <select className={field} style={fieldStyle} value={RECURRENCE_PRESETS.some((p) => p.value === recurrence) ? recurrence : "custom"} onChange={(e) => setRecurrence(e.target.value === "custom" ? recurrence : e.target.value)}>
              {RECURRENCE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value="custom">Custom RRULE</option>
            </select>
            {!RECURRENCE_PRESETS.some((p) => p.value === recurrence) && (
              <input className={`${field} mt-1`} style={fieldStyle} value={recurrence} onChange={(e) => setRecurrence(e.target.value)} placeholder="FREQ=WEEKLY;BYDAY=MO,WE" />
            )}
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Attendees</label>
            <div className="mb-1 flex flex-wrap gap-1">
              {attendees.map((a, i) => (
                <span key={a.clerkUserId || a.contactId || a.email} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs">
                  {a.name || a.email}
                  <button type="button" onClick={() => setAttendees(attendees.filter((_, j) => j !== i))} aria-label="Remove">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <input className={field} style={fieldStyle} value={attendeeQuery} onChange={(e) => setAttendeeQuery(e.target.value)} placeholder="Search team or contacts" />
            {suggestions.length > 0 && (
              <div className="mt-1 rounded border" style={{ borderColor: "var(--kb-border)" }}>
                {suggestions.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className="block w-full px-2 py-1 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setAttendees([...attendees, s.add]);
                      setAttendeeQuery("");
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {conflictCount > 0 && (
              <p className="mt-1 text-xs" style={{ color: "var(--kb-error)" }}>
                {conflictCount} attendee conflict{conflictCount > 1 ? "s" : ""} in this window.
              </p>
            )}
          </div>

          {rooms.length > 0 && (
            <div>
              <label className={labelCls} style={labelStyle}>Rooms</label>
              <div className="flex flex-wrap gap-1">
                {rooms.map((r) => {
                  const on = roomIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRoomIds(on ? roomIds.filter((x) => x !== r.id) : [...roomIds, r.id])}
                      className="rounded px-2 py-0.5 text-xs"
                      style={{ border: "1px solid var(--kb-border)", backgroundColor: on ? "var(--kb-primary)" : "transparent", color: on ? "#fff" : "var(--kb-text-secondary)" }}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls} style={labelStyle}>Link to record</label>
              <select className={field} style={fieldStyle} value={relatedType} onChange={(e) => setRelatedType(e.target.value)}>
                <option value="">None</option>
                {RELATED_RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Record ID</label>
              <input className={field} style={fieldStyle} value={relatedId} onChange={(e) => setRelatedId(e.target.value)} disabled={!relatedType} placeholder="record id" />
            </div>
          </div>

          <div>
            <label className={labelCls} style={labelStyle}>Description</label>
            <textarea className={field} style={fieldStyle} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls} style={labelStyle}>Calendar</label>
              <select className={field} style={fieldStyle} value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
                {writableCalendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Status</label>
              <select className={field} style={fieldStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Visibility</label>
              <select className={field} style={fieldStyle} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                {EVENT_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: "var(--kb-error)" }}>{error}</p>}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-white px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
          <div className="flex gap-2">
            {existing && (
              <>
                <KbButton variant="outline" onClick={onCancelEvent} disabled={busy}>Cancel event</KbButton>
                <button onClick={onDelete} disabled={busy} className="rounded p-2 hover:bg-gray-100" aria-label="Delete" style={{ color: "var(--kb-error)" }}>
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <KbButton variant="ghost" onClick={onClose} disabled={busy}>Close</KbButton>
            <KbButton variant="primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</KbButton>
          </div>
        </div>
      </div>
    </div>
  );
}
