"use client";

/*
 * Task calendar (Sprint 11). Month grid placing tasks on their dueAt. Click a
 * task chip to open the drawer; navigate months with the arrows.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskRow } from "@/lib/projects/queries";
import { TASK_STATUS_COLOR } from "./shared-ui";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TaskCalendar({ tasks, onOpen }: { tasks: TaskRow[]; onOpen: (id: string) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const byDay = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const key = ymd(new Date(t.dueAt));
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    }
    return m;
  }, [tasks]);

  const cells = useMemo(() => {
    const first = new Date(cursor);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: Array<{ date: Date | null }> = [];
    for (let i = 0; i < startWeekday; i++) out.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) out.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d) });
    while (out.length % 7 !== 0) out.push({ date: null });
    return out;
  }, [cursor]);

  const todayKey = ymd(new Date());

  return (
    <div className="rounded border bg-white" style={{ borderColor: "var(--kb-border)" }}>
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="rounded p-1 hover:bg-gray-100"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="rounded p-1 hover:bg-gray-100"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 border-t text-center text-[11px] font-medium" style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const key = cell.date ? ymd(cell.date) : "";
          const dayTasks = key ? byDay.get(key) ?? [] : [];
          return (
            <div key={i} className="min-h-[88px] border-t border-l p-1" style={{ borderColor: "var(--kb-border)", background: key === todayKey ? "#1d77bd0d" : "transparent" }}>
              {cell.date && <div className="mb-1 text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{cell.date.getDate()}</div>}
              <div className="space-y-1">
                {dayTasks.slice(0, 4).map((t) => (
                  <button key={t.id} onClick={() => onOpen(t.id)} className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-white" style={{ background: TASK_STATUS_COLOR[t.status] ?? "var(--kb-primary)" }} title={t.title}>
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 4 && <span className="text-[10px]" style={{ color: "var(--kb-text-secondary)" }}>+{dayTasks.length - 4} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
