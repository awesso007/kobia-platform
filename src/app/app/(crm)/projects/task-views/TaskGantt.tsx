"use client";

/*
 * Task Gantt (Sprint 11). Pure DOM/SVG, no charting library. Each task is a row;
 * its bar spans startAt..dueAt on a day axis. A vertical line marks today.
 * Dependency arrows are drawn from predecessor end to successor start.
 *
 * Drag the body of a bar to shift both start+due (reschedule); drag the right
 * edge handle to extend the due date. On mouseup we persist via updateTask.
 * If a task lacks a start/due it gets a sensible default window so it is still
 * visible and editable.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskRow, ProjectDetail } from "@/lib/projects/queries";
import { updateTask } from "../actions";
import { TASK_STATUS_COLOR, type MemberLite, memberName } from "./shared-ui";

const DAY = 86_400_000;
const COL_W = 28; // px per day
const ROW_H = 34;
const LABEL_W = 200;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type Bar = { task: TaskRow; startMs: number; endMs: number };

export function TaskGantt({
  tasks,
  dependencies,
  members,
  onOpen,
}: {
  tasks: TaskRow[];
  dependencies: ProjectDetail["dependencies"];
  members: Map<string, MemberLite>;
  onOpen: (id: string) => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; offsetDays: number } | null>(null);
  const [override, setOverride] = useState<Record<string, { startMs: number; endMs: number }>>({});

  // Derive a bar window for each task; default to today..+2d when missing.
  const bars: Bar[] = useMemo(() => {
    const today = startOfDay(Date.now());
    return tasks.map((t) => {
      const o = override[t.id];
      if (o) return { task: t, startMs: o.startMs, endMs: o.endMs };
      const s = t.startAt ? startOfDay(new Date(t.startAt).getTime()) : t.dueAt ? startOfDay(new Date(t.dueAt).getTime()) - 2 * DAY : today;
      const e = t.dueAt ? startOfDay(new Date(t.dueAt).getTime()) : s + 2 * DAY;
      return { task: t, startMs: s, endMs: Math.max(e, s) };
    });
  }, [tasks, override]);

  const { minMs, totalDays } = useMemo(() => {
    if (bars.length === 0) {
      const today = startOfDay(Date.now());
      return { minMs: today - 3 * DAY, totalDays: 30 };
    }
    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { lo = Math.min(lo, b.startMs); hi = Math.max(hi, b.endMs); }
    lo = Math.min(lo, startOfDay(Date.now()));
    hi = Math.max(hi, startOfDay(Date.now()));
    const min = lo - 2 * DAY;
    const days = Math.ceil((hi - min) / DAY) + 4;
    return { minMs: min, totalDays: days };
  }, [bars]);

  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    bars.forEach((b, i) => m.set(b.task.id, i));
    return m;
  }, [bars]);

  function xForMs(ms: number): number {
    return ((ms - minMs) / DAY) * COL_W;
  }

  function onBarMouseDown(e: React.MouseEvent, bar: Bar, mode: "move" | "resize") {
    e.stopPropagation();
    const startX = e.clientX;
    const origStart = bar.startMs;
    const origEnd = bar.endMs;
    function onMove(ev: MouseEvent) {
      const deltaDays = Math.round((ev.clientX - startX) / COL_W);
      setOverride((cur) => {
        if (mode === "move") {
          return { ...cur, [bar.task.id]: { startMs: origStart + deltaDays * DAY, endMs: origEnd + deltaDays * DAY } };
        }
        return { ...cur, [bar.task.id]: { startMs: origStart, endMs: Math.max(origStart, origEnd + deltaDays * DAY) } };
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setOverride((cur) => {
        const o = cur[bar.task.id];
        if (o) {
          start(async () => {
            await updateTask(bar.task.id, {
              startAt: new Date(o.startMs).toISOString(),
              dueAt: new Date(o.endMs).toISOString(),
            });
            router.refresh();
          });
        }
        return cur;
      });
      setDrag(null);
    }
    setDrag({ id: bar.task.id, mode, offsetDays: 0 });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const chartW = totalDays * COL_W;
  const chartH = bars.length * ROW_H;
  const todayX = xForMs(startOfDay(Date.now()));

  // Day axis ticks (weekly labels to avoid clutter).
  const ticks: Array<{ x: number; label: string }> = [];
  for (let i = 0; i <= totalDays; i++) {
    const ms = minMs + i * DAY;
    const d = new Date(ms);
    if (d.getDay() === 1) ticks.push({ x: i * COL_W, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) });
  }

  return (
    <div className="overflow-auto rounded border bg-white" style={{ borderColor: "var(--kb-border)" }} ref={containerRef}>
      <div className="flex">
        {/* Label column */}
        <div style={{ width: LABEL_W, flexShrink: 0 }}>
          <div style={{ height: 24, borderBottom: "1px solid var(--kb-border)" }} className="px-3 py-1 text-[11px] font-medium" />
          {bars.map((b) => (
            <div
              key={b.task.id}
              className="cursor-pointer truncate px-3 text-xs hover:bg-gray-50"
              style={{ height: ROW_H, lineHeight: `${ROW_H}px`, borderBottom: "1px solid var(--kb-border)", color: "var(--kb-text-primary)" }}
              onClick={() => onOpen(b.task.id)}
              title={b.task.title}
            >
              {b.task.title}
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ position: "relative", width: chartW }}>
          {/* axis */}
          <div style={{ height: 24, position: "relative", borderBottom: "1px solid var(--kb-border)" }}>
            {ticks.map((t, i) => (
              <span key={i} className="absolute text-[10px]" style={{ left: t.x + 2, top: 5, color: "var(--kb-text-secondary)" }}>{t.label}</span>
            ))}
          </div>

          <div style={{ position: "relative", height: chartH }}>
            {/* today line */}
            {todayX >= 0 && todayX <= chartW && (
              <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "var(--kb-error)", opacity: 0.6 }} />
            )}

            {/* dependency arrows */}
            <svg style={{ position: "absolute", inset: 0, width: chartW, height: chartH, pointerEvents: "none" }}>
              {dependencies.map((d) => {
                const pi = indexById.get(d.predecessorTaskId);
                const si = indexById.get(d.successorTaskId);
                if (pi === undefined || si === undefined) return null;
                const pb = bars[pi]!, sb = bars[si]!;
                const x1 = xForMs(pb.endMs) + COL_W;
                const y1 = pi * ROW_H + ROW_H / 2;
                const x2 = xForMs(sb.startMs);
                const y2 = si * ROW_H + ROW_H / 2;
                return (
                  <g key={d.id}>
                    <path d={`M ${x1} ${y1} C ${x1 + 16} ${y1}, ${x2 - 16} ${y2}, ${x2} ${y2}`} stroke="var(--kb-text-secondary)" strokeWidth={1.2} fill="none" />
                    <circle cx={x2} cy={y2} r={2.5} fill="var(--kb-text-secondary)" />
                  </g>
                );
              })}
            </svg>

            {/* bars */}
            {bars.map((b, i) => {
              const x = xForMs(b.startMs);
              const w = Math.max(COL_W, xForMs(b.endMs) + COL_W - x);
              const color = TASK_STATUS_COLOR[b.task.status] ?? "var(--kb-primary)";
              return (
                <div key={b.task.id} style={{ position: "absolute", top: i * ROW_H + 6, left: x, height: ROW_H - 12, width: w }}>
                  <div
                    className="relative h-full rounded text-[10px] text-white"
                    style={{ background: color, opacity: drag?.id === b.task.id ? 0.7 : 1, cursor: "grab", overflow: "hidden", whiteSpace: "nowrap" }}
                    onMouseDown={(e) => onBarMouseDown(e, b, "move")}
                    title={`${memberName(members, b.task.assigneeClerkUserId) ?? "Unassigned"}`}
                  >
                    <span className="px-1.5" style={{ lineHeight: `${ROW_H - 12}px` }}>{b.task.progressPct}%</span>
                    <div
                      onMouseDown={(e) => onBarMouseDown(e, b, "resize")}
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize", background: "rgba(0,0,0,0.15)" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
