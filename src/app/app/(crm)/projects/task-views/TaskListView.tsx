"use client";

/*
 * Flat sortable task list (Sprint 11). Click a column header to sort; click a
 * row to open the task drawer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState } from "react";
import type { TaskRow } from "@/lib/projects/queries";
import { TASK_PRIORITIES } from "@/lib/projects/shared";
import { Avatar, PriorityChip, StatusChip, formatDate, isOverdue, memberName, type MemberLite } from "./shared-ui";

type SortKey = "title" | "status" | "priority" | "dueAt" | "assignee";

const PRIORITY_RANK: Record<string, number> = Object.fromEntries(TASK_PRIORITIES.map((p, i) => [p, i]));

export function TaskListView({ tasks, members, onOpen }: { tasks: TaskRow[]; members: Map<string, MemberLite>; onOpen: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("dueAt");
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...tasks];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "priority": cmp = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0); break;
        case "dueAt": cmp = (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"); break;
        case "assignee": cmp = (memberName(members, a.assigneeClerkUserId) ?? "~").localeCompare(memberName(members, b.assigneeClerkUserId) ?? "~"); break;
      }
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [tasks, sortKey, asc, members]);

  function header(key: SortKey, label: string) {
    return (
      <th
        className="cursor-pointer select-none px-3 py-2 text-left font-medium"
        onClick={() => { if (sortKey === key) setAsc((v) => !v); else { setSortKey(key); setAsc(true); } }}
      >
        {label}{sortKey === key ? (asc ? " up" : " down") : ""}
      </th>
    );
  }

  return (
    <div className="overflow-hidden rounded border bg-white" style={{ borderColor: "var(--kb-border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
            {header("title", "Task")}
            {header("status", "Status")}
            {header("priority", "Priority")}
            {header("dueAt", "Due")}
            {header("assignee", "Assignee")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id} className="cursor-pointer border-t hover:bg-gray-50" style={{ borderColor: "var(--kb-border)" }} onClick={() => onOpen(t.id)}>
              <td className="px-3 py-2" style={{ color: "var(--kb-text-primary)" }}>{t.title}</td>
              <td className="px-3 py-2"><StatusChip status={t.status} /></td>
              <td className="px-3 py-2"><PriorityChip priority={t.priority} /></td>
              <td className="px-3 py-2" style={{ color: isOverdue(t.dueAt, t.status) ? "var(--kb-error)" : "var(--kb-text-secondary)" }}>{formatDate(t.dueAt) || "-"}</td>
              <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar name={memberName(members, t.assigneeClerkUserId)} /><span className="text-xs">{memberName(members, t.assigneeClerkUserId) ?? "Unassigned"}</span></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
