"use client";

/*
 * My Tasks client (Sprint 11). Time-range tabs (Today/Upcoming/All), group by
 * Project or Date, a Kanban/List/Calendar view toggle, and a quick-add input.
 * Clicking a task opens the shared TaskDrawer via the ?task= search param.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { TaskRow } from "@/lib/projects/queries";
import { createTask } from "../projects/actions";
import { TaskKanban } from "../projects/task-views/TaskKanban";
import { TaskListView } from "../projects/task-views/TaskListView";
import { TaskCalendar } from "../projects/task-views/TaskCalendar";
import { TaskDrawer } from "../projects/task-views/TaskDrawer";
import { buildMemberMap, formatDate, StatusChip, PriorityChip, Avatar, memberName, type MemberLite } from "../projects/task-views/shared-ui";

type Range = "today" | "upcoming" | "all";
type View = "kanban" | "list" | "calendar";
type GroupBy = "none" | "project" | "date";

const RANGE_LABELS: Record<Range, string> = { today: "Today", upcoming: "Upcoming", all: "All" };
const VIEW_LABELS: Record<View, string> = { kanban: "Kanban", list: "List", calendar: "Calendar" };

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function MyTasksClient({
  tasks,
  members,
  projects,
}: {
  tasks: TaskRow[];
  members: MemberLite[];
  projects: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, start] = useTransition();
  const [range, setRange] = useState<Range>("today");
  const [view, setView] = useState<View>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [quickTitle, setQuickTitle] = useState("");

  const openTaskId = searchParams.get("task");
  const memberMap = useMemo(() => buildMemberMap(members), [members]);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const openTask = useCallback((id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("task", id);
    router.replace(`/app/tasks?${p.toString()}`);
  }, [router, searchParams]);

  const closeTask = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("task");
    router.replace(`/app/tasks${p.toString() ? `?${p}` : ""}`);
  }, [router, searchParams]);

  const filtered = useMemo(() => {
    if (range === "all") return tasks;
    const end = endOfToday();
    const start = startOfToday();
    return tasks.filter((t) => {
      if (!t.dueAt) return range === "upcoming";
      const due = new Date(t.dueAt).getTime();
      if (range === "today") return due <= end;
      return due > end || due < start;
    });
  }, [tasks, range]);

  function quickAdd() {
    const title = quickTitle.trim();
    if (!title) return;
    start(async () => {
      await createTask({ title });
      setQuickTitle("");
      router.refresh();
    });
  }

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", tasks: filtered }];
    const map = new Map<string, TaskRow[]>();
    for (const t of filtered) {
      const key = groupBy === "project"
        ? (t.projectId ?? "__personal__")
        : (t.dueAt ? formatDate(t.dueAt) : "No due date");
      const bucket = map.get(key);
      if (bucket) bucket.push(t);
      else map.set(key, [t]);
    }
    return Array.from(map.entries()).map(([key, ts]) => ({
      key,
      label: groupBy === "project"
        ? (key === "__personal__" ? "Personal" : (projectName.get(key) ?? "Project"))
        : key,
      tasks: ts,
    }));
  }, [filtered, groupBy, projectName]);

  return (
    <div className="kobia-crm p-6" style={{ background: "var(--kb-page-bg)", minHeight: "100%" }}>
      <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>My Tasks</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded border p-0.5" style={{ borderColor: "var(--kb-border)" }}>
          {(["today", "upcoming", "all"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="rounded px-2.5 py-1 text-sm font-medium"
              style={{ background: range === r ? "var(--kb-primary)" : "transparent", color: range === r ? "#fff" : "var(--kb-text-secondary)" }}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>

        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }}>
          <option value="none">No grouping</option>
          <option value="project">Group by project</option>
          <option value="date">Group by date</option>
        </select>

        <div className="flex items-center gap-1 rounded border p-0.5" style={{ borderColor: "var(--kb-border)" }}>
          {(["list", "kanban", "calendar"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="rounded px-2.5 py-1 text-sm font-medium"
              style={{ background: view === v ? "var(--kb-primary)" : "transparent", color: view === v ? "#fff" : "var(--kb-text-secondary)" }}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }}
            placeholder="Quick add task"
            className="rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--kb-border)", minWidth: 200 }}
          />
          <KbButton variant="primary" onClick={quickAdd}><Plus size={14} /> Add</KbButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No tasks in this view.</p>
      ) : view === "calendar" ? (
        <TaskCalendar tasks={filtered} onOpen={openTask} />
      ) : view === "kanban" ? (
        <TaskKanban tasks={filtered} members={memberMap} onOpen={openTask} />
      ) : groupBy === "none" ? (
        <TaskListView tasks={filtered} members={memberMap} onOpen={openTask} />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1.5 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>{g.label} <span className="text-[11px] font-normal" style={{ color: "var(--kb-text-secondary)" }}>({g.tasks.length})</span></div>
              <div className="space-y-1">
                {g.tasks.map((t) => (
                  <button key={t.id} onClick={() => openTask(t.id)} className="flex w-full items-center gap-2 rounded border bg-white px-3 py-2 text-left text-sm hover:shadow-sm" style={{ borderColor: "var(--kb-border)" }}>
                    <span className="flex-1 truncate" style={{ color: "var(--kb-text-primary)" }}>{t.title}</span>
                    <StatusChip status={t.status} />
                    <PriorityChip priority={t.priority} />
                    {t.dueAt && <span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{formatDate(t.dueAt)}</span>}
                    <Avatar name={memberName(memberMap, t.assigneeClerkUserId)} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {openTaskId && (
        <TaskDrawer taskId={openTaskId} members={members} siblingTasks={tasks} onClose={closeTask} />
      )}
    </div>
  );
}
