"use client";

/*
 * Shared task-view UI helpers (Sprint 11): member maps, priority/status chips,
 * date formatting, and a compact task card used by Kanban + My Tasks.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { CalendarClock, MessageSquare, ListTree } from "lucide-react";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/projects/shared";
import type { TaskRow } from "@/lib/projects/queries";

export type MemberLite = { clerkUserId: string; displayName: string | null; email: string | null };

export const TASK_STATUS_COLOR: Record<string, string> = {
  TODO: "#828282",
  IN_PROGRESS: "#1d77bd",
  IN_REVIEW: "#7d4aea",
  DONE: "#5cb85c",
  BLOCKED: "#d9534f",
  CANCELED: "#9aa0a6",
};

export const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#828282",
  NORMAL: "#1d77bd",
  HIGH: "#f0ad4e",
  URGENT: "#d9534f",
};

export function memberName(map: Map<string, MemberLite>, id: string | null): string | null {
  if (!id) return null;
  const m = map.get(id);
  return m?.displayName ?? m?.email ?? id;
}

export function buildMemberMap(members: MemberLite[]): Map<string, MemberLite> {
  const m = new Map<string, MemberLite>();
  for (const x of members) m.set(x.clerkUserId, x);
  return m;
}

export function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({ name }: { name: string | null }) {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: "var(--kb-primary)" }}
      title={name ?? "Unassigned"}
    >
      {initials(name)}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  const color = PRIORITY_COLOR[priority] ?? "#828282";
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${color}1a`, color }}>
      {TASK_PRIORITY_LABELS[priority as keyof typeof TASK_PRIORITY_LABELS] ?? priority}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const color = TASK_STATUS_COLOR[status] ?? "#828282";
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${color}1a`, color }}>
      {TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] ?? status}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isOverdue(iso: string | null, status: string): boolean {
  if (!iso || status === "DONE" || status === "CANCELED") return false;
  return new Date(iso).getTime() < Date.now();
}

export function TaskCard({ task, memberMap, onOpen }: { task: TaskRow; memberMap: Map<string, MemberLite>; onOpen: (id: string) => void }) {
  const overdue = isOverdue(task.dueAt, task.status);
  return (
    <button
      onClick={() => onOpen(task.id)}
      className="block w-full rounded border bg-white p-2.5 text-left transition-shadow hover:shadow-sm"
      style={{ borderColor: "var(--kb-border)" }}
    >
      <div className="mb-1.5 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>{task.title}</div>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityChip priority={task.priority} />
        {task.dueAt && (
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: overdue ? "var(--kb-error)" : "var(--kb-text-secondary)" }}>
            <CalendarClock size={11} /> {formatDate(task.dueAt)}
          </span>
        )}
        {task.subtaskCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--kb-text-secondary)" }}>
            <ListTree size={11} /> {task.subtaskCount}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--kb-text-secondary)" }}>
            <MessageSquare size={11} /> {task.commentCount}
          </span>
        )}
        <span className="ml-auto"><Avatar name={memberName(memberMap, task.assigneeClerkUserId)} /></span>
      </div>
    </button>
  );
}
