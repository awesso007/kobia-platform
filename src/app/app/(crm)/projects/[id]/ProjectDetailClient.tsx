"use client";

/*
 * Project detail (Sprint 11). Header with key/status/progress/members and a
 * tabbed body: Tasks (Kanban), List, Gantt, Calendar, Time, Settings. Opening a
 * task (via ?task=id or clicking a card) shows the TaskDrawer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/projects/shared";
import type { ProjectDetail } from "@/lib/projects/queries";
import { createTask, updateProject, deleteProject, addProjectMember, removeProjectMember } from "../actions";
import { TaskKanban } from "../task-views/TaskKanban";
import { TaskListView } from "../task-views/TaskListView";
import { TaskGantt } from "../task-views/TaskGantt";
import { TaskCalendar } from "../task-views/TaskCalendar";
import { TimeView } from "../task-views/TimeView";
import { TaskDrawer } from "../task-views/TaskDrawer";
import { Avatar, buildMemberMap, memberName, type MemberLite } from "../task-views/shared-ui";

type Tab = "tasks" | "list" | "gantt" | "calendar" | "time" | "settings";
const TABS: Tab[] = ["tasks", "list", "gantt", "calendar", "time", "settings"];
const TAB_LABELS: Record<Tab, string> = { tasks: "Kanban", list: "List", gantt: "Gantt", calendar: "Calendar", time: "Time", settings: "Settings" };

const STATUS_COLOR: Record<string, string> = { PLANNING: "#7d4aea", ACTIVE: "#1d77bd", ON_HOLD: "#f0ad4e", COMPLETED: "#5cb85c", ARCHIVED: "#828282" };

export function ProjectDetailClient({ detail, members }: { detail: ProjectDetail; members: MemberLite[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("tasks");
  const [, start] = useTransition();
  const [quickTitle, setQuickTitle] = useState("");
  const openTaskId = searchParams.get("task");

  const memberMap = useMemo(() => buildMemberMap(members), [members]);

  const openTask = useCallback((id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("task", id);
    router.replace(`/app/projects/${detail.id}?${p.toString()}`);
  }, [router, searchParams, detail.id]);

  const closeTask = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("task");
    router.replace(`/app/projects/${detail.id}${p.toString() ? `?${p}` : ""}`);
  }, [router, searchParams, detail.id]);

  function quickAdd() {
    const title = quickTitle.trim();
    if (!title) return;
    const defaultList = detail.lists.find((l) => l.isDefault) ?? detail.lists[0];
    start(async () => {
      await createTask({ title, projectId: detail.id, listId: defaultList?.id ?? null });
      setQuickTitle("");
      router.refresh();
    });
  }

  return (
    <div className="kobia-crm p-6" style={{ background: "var(--kb-page-bg)", minHeight: "100%" }}>
      <Link href="/app/projects" className="mb-3 inline-flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        <ArrowLeft size={14} /> All projects
      </Link>

      {/* Header */}
      <div className="mb-4 rounded border bg-white p-4" style={{ borderColor: "var(--kb-border)", borderLeft: `4px solid ${detail.color ?? "var(--kb-primary)"}` }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--kb-text-secondary)" }}>{detail.key}</span>
          <h1 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>{detail.name}</h1>
          <span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: `${STATUS_COLOR[detail.status] ?? "#828282"}1a`, color: STATUS_COLOR[detail.status] ?? "#828282" }}>
            {PROJECT_STATUS_LABELS[detail.status as keyof typeof PROJECT_STATUS_LABELS] ?? detail.status}
          </span>
          <div className="ml-auto flex items-center -space-x-1.5">
            {detail.members.slice(0, 6).map((m) => <Avatar key={m.clerkUserId} name={m.displayName ?? m.email} />)}
          </div>
        </div>
        {detail.description && <p className="mt-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{detail.description}</p>}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--kb-surface-grey)" }}>
            <div className="h-full rounded-full" style={{ width: `${detail.progressPct}%`, background: "var(--kb-primary)" }} />
          </div>
          <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{detail.progressPct}%</span>
          {(detail.startDate || detail.endDate) && (
            <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{detail.startDate ?? "?"} - {detail.endDate ?? "?"}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--kb-border)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-2 text-sm font-medium"
            style={{ color: tab === t ? "var(--kb-primary)" : "var(--kb-text-secondary)", borderBottom: tab === t ? "2px solid var(--kb-primary)" : "2px solid transparent" }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
        {tab !== "settings" && tab !== "time" && (
          <div className="ml-auto flex items-center gap-2 pb-1">
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
        )}
      </div>

      {/* Body */}
      {tab === "tasks" && <TaskKanban tasks={detail.tasks} members={memberMap} onOpen={openTask} />}
      {tab === "list" && <TaskListView tasks={detail.tasks} members={memberMap} onOpen={openTask} />}
      {tab === "gantt" && <TaskGantt tasks={detail.tasks} dependencies={detail.dependencies} members={memberMap} onOpen={openTask} />}
      {tab === "calendar" && <TaskCalendar tasks={detail.tasks} onOpen={openTask} />}
      {tab === "time" && <TimeView projectId={detail.id} entries={detail.timeEntries} members={memberMap} />}
      {tab === "settings" && <SettingsTab detail={detail} members={members} memberMap={memberMap} />}

      {openTaskId && (
        <TaskDrawer taskId={openTaskId} members={members} siblingTasks={detail.tasks} onClose={closeTask} />
      )}
    </div>
  );
}

function SettingsTab({ detail, members, memberMap }: { detail: ProjectDetail; members: MemberLite[]; memberMap: Map<string, MemberLite> }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [name, setName] = useState(detail.name);
  const [status, setStatus] = useState(detail.status);
  const [addId, setAddId] = useState("");

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded border bg-white p-4" style={{ borderColor: "var(--kb-border)" }}>
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} /></label>
          <label className="block"><span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
            </select></label>
          <KbButton variant="primary" onClick={() => start(async () => { await updateProject(detail.id, { name, status }); router.refresh(); })}>Save changes</KbButton>
        </div>
      </div>

      <div className="rounded border bg-white p-4" style={{ borderColor: "var(--kb-border)" }}>
        <div className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Members</div>
        <div className="space-y-1">
          {detail.members.map((m) => (
            <div key={m.clerkUserId} className="flex items-center justify-between py-0.5 text-sm">
              <div className="flex items-center gap-2"><Avatar name={m.displayName ?? m.email} /><span>{memberName(memberMap, m.clerkUserId)}</span><span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{m.role}</span></div>
              <button className="text-[11px]" style={{ color: "var(--kb-error)" }} onClick={() => start(async () => { await removeProjectMember(detail.id, m.clerkUserId); router.refresh(); })}>Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <select value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--kb-border)" }}>
            <option value="">Add member...</option>
            {members.filter((m) => !detail.members.some((pm) => pm.clerkUserId === m.clerkUserId)).map((m) => <option key={m.clerkUserId} value={m.clerkUserId}>{memberName(memberMap, m.clerkUserId)}</option>)}
          </select>
          <KbButton variant="outline" onClick={() => { if (addId) start(async () => { await addProjectMember(detail.id, addId); setAddId(""); router.refresh(); }); }}>Add</KbButton>
        </div>
      </div>

      <div className="rounded border bg-white p-4" style={{ borderColor: "var(--kb-border)" }}>
        <div className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-error)" }}>Danger zone</div>
        <button className="text-sm" style={{ color: "var(--kb-error)" }} onClick={() => { if (confirm("Delete this project and all its tasks?")) start(async () => { await deleteProject(detail.id); router.push("/app/projects"); }); }}>
          Delete project
        </button>
      </div>
    </div>
  );
}
