"use client";

/*
 * Project time view (Sprint 11). Shows a start/stop timer for the project, a
 * manual log form, a pie chart of minutes logged by member, and the entry log.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { KbButton } from "@/components/crm/ui";
import { startTimer, stopTimer, logTime } from "../actions";
import { memberName, type MemberLite } from "./shared-ui";

type Entry = { id: string; clerkUserId: string; description: string | null; startedAt: string; endedAt: string | null; durationMinutes: number; billable: boolean };

const PIE_COLORS = ["#1d77bd", "#2fc6f6", "#7d4aea", "#5cb85c", "#f0ad4e", "#d9534f", "#828282"];

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

export function TimeView({ projectId, entries, members }: { projectId: string; entries: Entry[]; members: Map<string, MemberLite> }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [desc, setDesc] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");

  const byMember = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.clerkUserId, (m.get(e.clerkUserId) ?? 0) + e.durationMinutes);
    return Array.from(m.entries()).map(([uid, minutes]) => ({ name: memberName(members, uid) ?? uid, minutes }));
  }, [entries, members]);

  const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);

  function toggleTimer() {
    if (activeTimer) {
      const id = activeTimer;
      setActiveTimer(null);
      start(async () => { await stopTimer(id); router.refresh(); });
    } else {
      start(async () => {
        const id = await startTimer(null, projectId, desc || undefined);
        setActiveTimer(id);
      });
    }
  }

  function addManual() {
    const minutes = Number(manualMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    start(async () => {
      await logTime({ taskId: null, projectId, durationMinutes: minutes, description: desc || undefined });
      setManualMinutes("");
      setDesc("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-4" style={{ borderColor: "var(--kb-border)" }}>
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>Description</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} placeholder="What are you working on?" />
        </label>
        <KbButton variant={activeTimer ? "outline" : "primary"} onClick={toggleTimer}>
          {activeTimer ? "Stop timer" : "Start timer"}
        </KbButton>
        <div className="flex items-end gap-2">
          <label>
            <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>Log minutes</span>
            <input value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} type="number" className="w-24 rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} />
          </label>
          <KbButton variant="outline" onClick={addManual}>Add</KbButton>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border bg-white p-4" style={{ borderColor: "var(--kb-border)" }}>
          <div className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>By member ({fmtMinutes(totalMinutes)} total)</div>
          {byMember.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No time logged yet.</p>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byMember} dataKey="minutes" nameKey="name" outerRadius={80} label={(d) => fmtMinutes(Number((d as { minutes?: number }).minutes ?? 0))}>
                    {byMember.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMinutes(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded border bg-white p-4" style={{ borderColor: "var(--kb-border)" }}>
          <div className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Entries</div>
          <div className="max-h-56 space-y-2 overflow-auto">
            {entries.length === 0 && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No entries.</p>}
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b pb-1 text-xs" style={{ borderColor: "var(--kb-border)" }}>
                <span className="truncate" style={{ color: "var(--kb-text-primary)" }}>{e.description || "(no description)"}</span>
                <span style={{ color: "var(--kb-text-secondary)" }}>{memberName(members, e.clerkUserId)} - {fmtMinutes(e.durationMinutes)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
