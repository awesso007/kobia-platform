"use client";

/*
 * Calendar client (Sprint 12). Header (calendar nav + view toggle + New event),
 * a sidebar of toggleable calendars, and four views: Day, Week, Month, Agenda.
 * Week/Day render an hourly grid with absolutely-positioned event blocks and
 * support click-to-create (click an empty slot) and click-to-open (click a
 * block). Drag-create/move/resize are kept simple: click a slot to seed a 1h
 * event in the drawer. Saving any event refreshes the route.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { CalendarLite, EventLite, MemberLite, ContactLite, RoomLite } from "@/lib/calendar/queries";
import { DAY_LABELS, startOfDay, startOfWeek, addDays, isoDate, minutesToLabel } from "@/lib/calendar/shared";
import { EventDrawer, type DrawerSeed } from "./EventDrawer";

type ViewKind = "day" | "week" | "month" | "agenda";

const HOUR_PX = 44;

function calColor(calendars: CalendarLite[], ev: EventLite): string {
  if (ev.colorOverride) return ev.colorOverride;
  return calendars.find((c) => c.id === ev.calendarId)?.color ?? "#1d77bd";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return minutesToLabel(d.getHours() * 60 + d.getMinutes());
}

export function CalendarClient({
  calendars,
  events,
  members,
  contacts,
  rooms,
}: {
  calendars: CalendarLite[];
  events: EventLite[];
  members: MemberLite[];
  contacts: ContactLite[];
  rooms: RoomLite[];
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewKind>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<DrawerSeed | null>(null);

  const visibleEvents = useMemo(
    () => events.filter((e) => !hidden.has(e.calendarId)),
    [events, hidden],
  );

  function toggleCalendar(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function shift(dir: number) {
    if (view === "day") setAnchor((a) => addDays(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else if (view === "month") setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
    else setAnchor((a) => addDays(a, dir * 7));
  }

  function onSaved() {
    setDrawer(null);
    router.refresh();
  }

  const myCalendars = calendars.filter((c) => !c.type.startsWith("EXTERNAL_") && c.type !== "TEAM" && c.type !== "RESOURCE");
  const otherCalendars = calendars.filter((c) => c.type === "TEAM" || c.type === "RESOURCE" || c.type.startsWith("EXTERNAL_"));

  const heading = useMemo(() => {
    if (view === "month") return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (view === "day") return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    return `${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${we.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }, [view, anchor]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
        <div className="flex items-center gap-2">
          <KbButton variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</KbButton>
          <button onClick={() => shift(-1)} className="rounded p-1.5 hover:bg-gray-100" aria-label="Previous"><ChevronLeft size={18} /></button>
          <button onClick={() => shift(1)} className="rounded p-1.5 hover:bg-gray-100" aria-label="Next"><ChevronRight size={18} /></button>
          <h1 className="ml-1 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>{heading}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border" style={{ borderColor: "var(--kb-border)" }}>
            {(["day", "week", "month", "agenda"] as ViewKind[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1.5 text-sm capitalize"
                style={{ backgroundColor: view === v ? "var(--kb-primary)" : "transparent", color: view === v ? "#fff" : "var(--kb-text-secondary)" }}
              >
                {v}
              </button>
            ))}
          </div>
          <KbButton variant="primary" onClick={() => setDrawer({})}><Plus size={16} /> New event</KbButton>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r p-3 md:block" style={{ borderColor: "var(--kb-border)" }}>
          <SidebarSection title="My calendars" calendars={myCalendars} hidden={hidden} onToggle={toggleCalendar} />
          {otherCalendars.length > 0 && <SidebarSection title="Other calendars" calendars={otherCalendars} hidden={hidden} onToggle={toggleCalendar} />}
        </aside>

        <div className="flex-1 overflow-auto">
          {view === "month" && <MonthView anchor={anchor} events={visibleEvents} calendars={calendars} onSlot={(d) => setDrawer({ startAt: d.toISOString(), endAt: new Date(d.getTime() + 3_600_000).toISOString() })} onOpen={(e) => setDrawer({ event: e })} />}
          {(view === "week" || view === "day") && (
            <TimeGrid
              days={view === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))}
              events={visibleEvents}
              calendars={calendars}
              onSlot={(d) => setDrawer({ startAt: d.toISOString(), endAt: new Date(d.getTime() + 3_600_000).toISOString() })}
              onOpen={(e) => setDrawer({ event: e })}
            />
          )}
          {view === "agenda" && <AgendaView anchor={anchor} events={visibleEvents} calendars={calendars} onOpen={(e) => setDrawer({ event: e })} />}
        </div>
      </div>

      {drawer && (
        <EventDrawer
          seed={drawer}
          calendars={calendars}
          members={members}
          contacts={contacts}
          rooms={rooms}
          events={events}
          onClose={() => setDrawer(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function SidebarSection({
  title,
  calendars,
  hidden,
  onToggle,
}: {
  title: string;
  calendars: CalendarLite[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-semibold uppercase" style={{ color: "var(--kb-text-secondary)" }}>{title}</p>
      <ul className="space-y-1">
        {calendars.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
              <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => onToggle(c.id)} />
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </label>
          </li>
        ))}
        {calendars.length === 0 && <li className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>None yet</li>}
      </ul>
    </div>
  );
}

function TimeGrid({
  days,
  events,
  calendars,
  onSlot,
  onOpen,
}: {
  days: Date[];
  events: EventLite[];
  calendars: CalendarLite[];
  onSlot: (d: Date) => void;
  onOpen: (e: EventLite) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="min-w-[640px]">
      <div className="sticky top-0 z-10 flex border-b bg-white" style={{ borderColor: "var(--kb-border)" }}>
        <div className="w-14 shrink-0" />
        {days.map((d) => {
          const today = isoDate(d) === isoDate(new Date());
          return (
            <div key={d.toISOString()} className="flex-1 py-2 text-center text-sm" style={{ color: today ? "var(--kb-primary)" : "var(--kb-text-secondary)" }}>
              <div>{DAY_LABELS[d.getDay()]}</div>
              <div className="text-base font-semibold">{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div className="flex">
        <div className="w-14 shrink-0">
          {hours.map((h) => (
            <div key={h} className="text-right pr-1 text-[10px]" style={{ height: HOUR_PX, color: "var(--kb-text-secondary)" }}>
              {h === 0 ? "" : minutesToLabel(h * 60)}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayStart = startOfDay(d);
          const dayEvents = events.filter((e) => {
            const s = new Date(e.startAt);
            return isoDate(s) === isoDate(d) && !e.allDay;
          });
          return (
            <div key={d.toISOString()} className="relative flex-1 border-l" style={{ borderColor: "var(--kb-border)", height: HOUR_PX * 24 }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-b hover:bg-blue-50/40"
                  style={{ height: HOUR_PX, borderColor: "var(--kb-border)" }}
                  onClick={() => onSlot(new Date(dayStart.getTime() + h * 3_600_000))}
                />
              ))}
              {dayEvents.map((e) => {
                const s = new Date(e.startAt);
                const en = new Date(e.endAt);
                const top = (s.getHours() * 60 + s.getMinutes()) * (HOUR_PX / 60);
                const mins = Math.max(30, (en.getTime() - s.getTime()) / 60_000);
                const h = mins * (HOUR_PX / 60);
                const color = calColor(calendars, e);
                return (
                  <button
                    key={e.id}
                    onClick={(ev) => { ev.stopPropagation(); onOpen(e); }}
                    className="absolute left-1 right-1 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] text-white"
                    style={{ top, height: h, backgroundColor: color, opacity: e.status === "CANCELED" ? 0.5 : 1, textDecoration: e.status === "CANCELED" ? "line-through" : "none" }}
                  >
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="truncate opacity-90">{fmtTime(e.startAt)}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  anchor,
  events,
  calendars,
  onSlot,
  onOpen,
}: {
  anchor: Date;
  events: EventLite[];
  calendars: CalendarLite[];
  onSlot: (d: Date) => void;
  onOpen: (e: EventLite) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const byDay = useMemo(() => {
    const m = new Map<string, EventLite[]>();
    for (const e of events) {
      const key = isoDate(new Date(e.startAt));
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    return m;
  }, [events]);

  return (
    <div className="grid grid-cols-7" style={{ borderTop: "1px solid var(--kb-border)" }}>
      {DAY_LABELS.map((d) => (
        <div key={d} className="border-b border-r py-1 text-center text-xs font-medium" style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}>{d}</div>
      ))}
      {cells.map((d) => {
        const dayEvents = byDay.get(isoDate(d)) ?? [];
        const inMonth = d.getMonth() === anchor.getMonth();
        const today = isoDate(d) === isoDate(new Date());
        return (
          <div
            key={d.toISOString()}
            className="min-h-[96px] border-b border-r p-1 align-top"
            style={{ borderColor: "var(--kb-border)", backgroundColor: inMonth ? "#fff" : "var(--kb-page-bg)" }}
            onClick={() => onSlot(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9))}
          >
            <div className="mb-0.5 text-right text-xs" style={{ color: today ? "var(--kb-primary)" : inMonth ? "var(--kb-text-primary)" : "var(--kb-text-secondary)", fontWeight: today ? 700 : 400 }}>{d.getDate()}</div>
            <div className="space-y-0.5">
              {dayEvents.slice(0, 3).map((e) => (
                <button
                  key={e.id}
                  onClick={(ev) => { ev.stopPropagation(); onOpen(e); }}
                  className="block w-full truncate rounded px-1 text-left text-[11px] text-white"
                  style={{ backgroundColor: calColor(calendars, e), opacity: e.status === "CANCELED" ? 0.5 : 1 }}
                >
                  {e.allDay ? "" : `${fmtTime(e.startAt)} `}{e.title}
                </button>
              ))}
              {dayEvents.length > 3 && <div className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>+{dayEvents.length - 3} more</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({
  anchor,
  events,
  calendars,
  onOpen,
}: {
  anchor: Date;
  events: EventLite[];
  calendars: CalendarLite[];
  onOpen: (e: EventLite) => void;
}) {
  const from = startOfWeek(anchor).getTime();
  const to = addDays(startOfWeek(anchor), 14).getTime();
  const groups = useMemo(() => {
    const m = new Map<string, EventLite[]>();
    for (const e of events) {
      const t = new Date(e.startAt).getTime();
      if (t < from || t >= to) continue;
      const key = isoDate(new Date(e.startAt));
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [events, from, to]);

  if (groups.length === 0) return <div className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No events in this range.</div>;

  return (
    <div className="divide-y" style={{ borderColor: "var(--kb-border)" }}>
      {groups.map(([day, list]) => (
        <div key={day} className="px-4 py-3">
          <p className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
            {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <ul className="space-y-1">
            {list.sort((a, b) => a.startAt.localeCompare(b.startAt)).map((e) => (
              <li key={e.id}>
                <button onClick={() => onOpen(e)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-50">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: calColor(calendars, e) }} />
                  <span className="w-24 shrink-0 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{e.allDay ? "All day" : fmtTime(e.startAt)}</span>
                  <span className="truncate" style={{ color: "var(--kb-text-primary)", textDecoration: e.status === "CANCELED" ? "line-through" : "none" }}>{e.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
