"use client";

/*
 * Task Kanban (Sprint 11). Columns by TaskStatus; HTML5 drag-and-drop moves a
 * card between columns and calls updateTask({status}). Optimistic local move.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/projects/shared";
import type { TaskRow } from "@/lib/projects/queries";
import { updateTask } from "../actions";
import { TaskCard, TASK_STATUS_COLOR, type MemberLite } from "./shared-ui";

export function TaskKanban({ tasks, members, onOpen }: { tasks: TaskRow[]; members: Map<string, MemberLite>; onOpen: (id: string) => void }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [local, setLocal] = useState(tasks);
  const [dragId, setDragId] = useState<string | null>(null);

  function move(taskId: string, status: string) {
    setLocal((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)));
    start(async () => {
      await updateTask(taskId, { status });
      router.refresh();
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {TASK_STATUSES.map((status) => {
        const col = local.filter((t) => t.status === status);
        return (
          <div
            key={status}
            className="flex w-64 flex-shrink-0 flex-col rounded"
            style={{ background: "var(--kb-surface-grey)" }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) move(dragId, status); setDragId(null); }}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="h-2 w-2 rounded-full" style={{ background: TASK_STATUS_COLOR[status] }} />
              <span className="text-xs font-semibold" style={{ color: "var(--kb-text-primary)" }}>{TASK_STATUS_LABELS[status]}</span>
              <span className="ml-auto text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{col.length}</span>
            </div>
            <div className="flex flex-col gap-2 px-2 pb-2">
              {col.map((t) => (
                <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}>
                  <TaskCard task={t} memberMap={members} onOpen={onOpen} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
