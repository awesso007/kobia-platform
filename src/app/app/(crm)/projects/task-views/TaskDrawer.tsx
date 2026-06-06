"use client";

/*
 * Task drawer (Sprint 11). Slides in from the right; loads full task detail on
 * open and lets the user edit inline (title, description, status, priority,
 * assignee, dates), manage checklists, dependencies, comments with @mentions,
 * time entries, and attachments.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/projects/shared";
import type { TaskFullDetail, TaskRow } from "@/lib/projects/queries";
import {
  loadTaskDetail,
  updateTask,
  deleteTask,
  addChecklist,
  addChecklistItem,
  toggleChecklistItem,
  addTaskComment,
  addDependency,
  removeDependency,
  logTime,
} from "../actions";
import { memberName, type MemberLite } from "./shared-ui";

type Tab = "details" | "checklists" | "dependencies" | "time" | "comments";

export function TaskDrawer({
  taskId,
  members,
  siblingTasks,
  onClose,
}: {
  taskId: string;
  members: MemberLite[];
  siblingTasks: TaskRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [detail, setDetail] = useState<TaskFullDetail | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const memberMap = useMemo(() => { const m = new Map<string, MemberLite>(); for (const x of members) m.set(x.clerkUserId, x); return m; }, [members]);

  async function reload() {
    const d = await loadTaskDetail(taskId);
    setDetail(d);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [taskId]);

  function patch(input: Parameters<typeof updateTask>[1]) {
    start(async () => { await updateTask(taskId, input); await reload(); router.refresh(); });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-white" style={{ boxShadow: "var(--kb-shadow-modal)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
          <input
            defaultValue={detail?.title ?? ""}
            key={detail?.id ?? "loading"}
            onBlur={(e) => { if (detail && e.target.value.trim() && e.target.value !== detail.title) patch({ title: e.target.value }); }}
            className="flex-1 text-base font-semibold outline-none"
            style={{ color: "var(--kb-text-primary)" }}
            placeholder="Task title"
          />
          <button onClick={onClose} className="ml-2 rounded p-1 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex gap-1 border-b px-3" style={{ borderColor: "var(--kb-border)" }}>
          {(["details", "checklists", "dependencies", "time", "comments"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-2 text-xs font-medium capitalize"
              style={{ color: tab === t ? "var(--kb-primary)" : "var(--kb-text-secondary)", borderBottom: tab === t ? "2px solid var(--kb-primary)" : "2px solid transparent" }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!detail ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading...</p>
          ) : tab === "details" ? (
            <DetailsTab detail={detail} members={members} patch={patch} />
          ) : tab === "checklists" ? (
            <ChecklistsTab detail={detail} reload={reload} />
          ) : tab === "dependencies" ? (
            <DependenciesTab detail={detail} siblingTasks={siblingTasks} reload={reload} />
          ) : tab === "time" ? (
            <TimeTab detail={detail} memberMap={memberMap} reload={reload} />
          ) : (
            <CommentsTab detail={detail} members={members} memberMap={memberMap} reload={reload} />
          )}
        </div>

        {detail && (
          <div className="border-t px-4 py-2 text-right" style={{ borderColor: "var(--kb-border)" }}>
            <button className="text-xs" style={{ color: "var(--kb-error)" }} onClick={() => start(async () => { await deleteTask(taskId); router.refresh(); onClose(); })}>
              Delete task
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-center gap-2">
      <span className="text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

function DetailsTab({ detail, members, patch }: { detail: TaskFullDetail; members: MemberLite[]; patch: (i: Parameters<typeof updateTask>[1]) => void }) {
  const sel = "w-full rounded border px-2 py-1 text-sm";
  const border = { borderColor: "var(--kb-border)" };
  return (
    <div className="space-y-3">
      <Row label="Status">
        <select className={sel} style={border} defaultValue={detail.status} onChange={(e) => patch({ status: e.target.value })}>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
        </select>
      </Row>
      <Row label="Priority">
        <select className={sel} style={border} defaultValue={detail.priority} onChange={(e) => patch({ priority: e.target.value })}>
          {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
        </select>
      </Row>
      <Row label="Assignee">
        <select className={sel} style={border} defaultValue={detail.assigneeClerkUserId ?? ""} onChange={(e) => patch({ assigneeClerkUserId: e.target.value || null })}>
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.clerkUserId} value={m.clerkUserId}>{memberName(new Map(members.map((x) => [x.clerkUserId, x])), m.clerkUserId)}</option>)}
        </select>
      </Row>
      <Row label="Start">
        <input type="date" className={sel} style={border} defaultValue={detail.startAt ? detail.startAt.slice(0, 10) : ""} onChange={(e) => patch({ startAt: e.target.value || null })} />
      </Row>
      <Row label="Due">
        <input type="date" className={sel} style={border} defaultValue={detail.dueAt ? detail.dueAt.slice(0, 10) : ""} onChange={(e) => patch({ dueAt: e.target.value || null })} />
      </Row>
      <Row label="Estimated min">
        <input type="number" className={sel} style={border} defaultValue={detail.estimatedMinutes ?? ""} onBlur={(e) => patch({ estimatedMinutes: e.target.value ? Number(e.target.value) : null })} />
      </Row>
      <Row label="Progress %">
        <input type="number" className={sel} style={border} defaultValue={detail.progressPct} onBlur={(e) => patch({ progressPct: Number(e.target.value) })} />
      </Row>
      <div>
        <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>Description</span>
        <textarea className="w-full rounded border px-2 py-1.5 text-sm" style={border} rows={5} defaultValue={detail.description ?? ""} onBlur={(e) => patch({ description: e.target.value })} />
      </div>
    </div>
  );
}

function ChecklistsTab({ detail, reload }: { detail: TaskFullDetail; reload: () => Promise<void> }) {
  const [, start] = useTransition();
  const [newList, setNewList] = useState("");
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      {detail.checklists.map((c) => {
        const done = c.items.filter((i) => i.done).length;
        return (
          <div key={c.id} className="rounded border p-3" style={{ borderColor: "var(--kb-border)" }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>{c.title}</span>
              <span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{done}/{c.items.length}</span>
            </div>
            <div className="space-y-1">
              {c.items.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={i.done} onChange={(e) => start(async () => { await toggleChecklistItem(i.id, e.target.checked); await reload(); })} />
                  <span style={{ textDecoration: i.done ? "line-through" : "none", color: i.done ? "var(--kb-text-secondary)" : "var(--kb-text-primary)" }}>{i.title}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={newItem[c.id] ?? ""} onChange={(e) => setNewItem((s) => ({ ...s, [c.id]: e.target.value }))} placeholder="Add item" className="flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--kb-border)" }}
                onKeyDown={(e) => { if (e.key === "Enter" && (newItem[c.id] ?? "").trim()) start(async () => { await addChecklistItem(c.id, newItem[c.id]!); setNewItem((s) => ({ ...s, [c.id]: "" })); await reload(); }); }} />
            </div>
          </div>
        );
      })}
      <div className="flex gap-2">
        <input value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="New checklist" className="flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--kb-border)" }} />
        <KbButton variant="outline" onClick={() => { if (newList.trim()) start(async () => { await addChecklist(detail.id, newList); setNewList(""); await reload(); }); }}>Add</KbButton>
      </div>
    </div>
  );
}

function DependenciesTab({ detail, siblingTasks, reload }: { detail: TaskFullDetail; siblingTasks: TaskRow[]; reload: () => Promise<void> }) {
  const [, start] = useTransition();
  const [predId, setPredId] = useState("");
  const titleById = useMemo(() => { const m = new Map<string, string>(); for (const t of siblingTasks) m.set(t.id, t.title); return m; }, [siblingTasks]);
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold" style={{ color: "var(--kb-text-primary)" }}>Blocked by (predecessors)</div>
        {detail.predecessors.length === 0 && <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>None.</p>}
        {detail.predecessors.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-0.5 text-sm">
            <span>{titleById.get(d.predecessorTaskId) ?? d.predecessorTaskId}</span>
            <button className="text-[11px]" style={{ color: "var(--kb-error)" }} onClick={() => start(async () => { await removeDependency(d.id); await reload(); })}>Remove</button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <select value={predId} onChange={(e) => setPredId(e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--kb-border)" }}>
            <option value="">Select a task...</option>
            {siblingTasks.filter((t) => t.id !== detail.id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <KbButton variant="outline" onClick={() => { if (predId) start(async () => { await addDependency(predId, detail.id); setPredId(""); await reload(); }); }}>Add</KbButton>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold" style={{ color: "var(--kb-text-primary)" }}>Blocks (successors)</div>
        {detail.successors.length === 0 && <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>None.</p>}
        {detail.successors.map((d) => (
          <div key={d.id} className="py-0.5 text-sm">{titleById.get(d.successorTaskId) ?? d.successorTaskId}</div>
        ))}
      </div>
    </div>
  );
}

function TimeTab({ detail, memberMap, reload }: { detail: TaskFullDetail; memberMap: Map<string, MemberLite>; reload: () => Promise<void> }) {
  const [, start] = useTransition();
  const [minutes, setMinutes] = useState("");
  const [desc, setDesc] = useState("");
  const total = detail.timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
  return (
    <div className="space-y-3">
      <div className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Logged: {total}m{detail.estimatedMinutes ? ` / ${detail.estimatedMinutes}m estimated` : ""}</div>
      <div className="flex items-end gap-2">
        <label className="flex-1"><span className="mb-1 block text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>Description</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--kb-border)" }} /></label>
        <label><span className="mb-1 block text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>Minutes</span>
          <input type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-20 rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--kb-border)" }} /></label>
        <KbButton variant="outline" onClick={() => { const m = Number(minutes); if (m > 0) start(async () => { await logTime({ taskId: detail.id, projectId: detail.projectId, durationMinutes: m, description: desc || undefined }); setMinutes(""); setDesc(""); await reload(); }); }}>Log</KbButton>
      </div>
      <div className="space-y-1">
        {detail.timeEntries.map((e) => (
          <div key={e.id} className="flex items-center justify-between border-b py-1 text-xs" style={{ borderColor: "var(--kb-border)" }}>
            <span>{e.description || "(no description)"}</span>
            <span style={{ color: "var(--kb-text-secondary)" }}>{memberName(memberMap, e.clerkUserId)} - {e.durationMinutes}m</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentsTab({ detail, members, memberMap, reload }: { detail: TaskFullDetail; members: MemberLite[]; memberMap: Map<string, MemberLite>; reload: () => Promise<void> }) {
  const [, start] = useTransition();
  const [body, setBody] = useState("");

  function submit() {
    const text = body.trim();
    if (!text) return;
    // Resolve @mentions: match @name against member display names/emails.
    const mentions = members
      .filter((m) => {
        const handle = (m.displayName ?? m.email ?? "").toLowerCase().replace(/\s+/g, "");
        return handle && text.toLowerCase().includes(`@${handle}`);
      })
      .map((m) => m.clerkUserId);
    start(async () => { await addTaskComment(detail.id, text, mentions); setBody(""); await reload(); });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {detail.comments.length === 0 && <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>No comments yet.</p>}
        {detail.comments.map((c) => (
          <div key={c.id} className="rounded border p-2" style={{ borderColor: "var(--kb-border)" }}>
            <div className="mb-0.5 text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>{c.authorName ?? memberName(memberMap, c.clerkUserId) ?? c.clerkUserId}</div>
            <div className="whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-primary)" }}>{c.body}</div>
          </div>
        ))}
      </div>
      <div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Add a comment. Use @name to mention a member." className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} />
        <div className="mt-1 text-right"><KbButton variant="primary" onClick={submit}>Comment</KbButton></div>
      </div>
    </div>
  );
}
