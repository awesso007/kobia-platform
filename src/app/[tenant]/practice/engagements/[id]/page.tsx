import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
  updateEngagementStatusAction,
  deleteEngagementAction,
} from "@/app/actions/practice-actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MED: "bg-sky-100 text-sky-800",
  HIGH: "bg-amber-100 text-amber-800",
  URGENT: "bg-rose-100 text-rose-800",
};

const STATUS_COL: { key: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE"; label: string; color: string }[] =
  [
    { key: "TODO", label: "To do", color: "bg-slate-50" },
    { key: "IN_PROGRESS", label: "In progress", color: "bg-sky-50" },
    { key: "BLOCKED", label: "Blocked", color: "bg-amber-50" },
    { key: "DONE", label: "Done", color: "bg-emerald-50" },
  ];

export default async function EngagementDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const engagement = await db.engagement.findFirst({
    where: { id: params.id, tenantId: auth.tenant.id },
    include: {
      entity: { select: { id: true, name: true } },
      tasks: {
        orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!engagement) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-rose-700">Engagement not found.</p>
        <Link
          href={`/${params.tenant}/practice`}
          className="mt-3 inline-block text-xs text-slate-500 hover:text-slate-700"
        >
          ← Back to practice
        </Link>
      </div>
    );
  }

  const members = await db.membership.findMany({
    where: { tenantId: auth.tenant.id, isActive: true },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { acceptedAt: "asc" },
  });

  const tasksByStatus: Record<string, typeof engagement.tasks> = {
    TODO: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    DONE: [],
  };
  for (const t of engagement.tasks) {
    tasksByStatus[t.status]!.push(t);
  }

  const memberOptions = members.map((m) => ({
    id: m.user.id,
    label: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email,
  }));
  const memberById = new Map(memberOptions.map((m) => [m.id, m.label]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="text-xs text-slate-500">
        <Link href={`/${params.tenant}/practice`} className="hover:text-slate-700">
          ← Practice
        </Link>
      </div>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{engagement.name}</h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {engagement.type}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs ${
                engagement.status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800"
                  : engagement.status === "ON_HOLD"
                    ? "bg-amber-100 text-amber-800"
                    : engagement.status === "COMPLETED"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-rose-100 text-rose-800"
              }`}
            >
              {engagement.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Client:{" "}
            <span className="font-medium text-slate-800">{engagement.entity.name}</span>{" "}
            · Start: {fmtDate(engagement.startDate)} · Target:{" "}
            {fmtDate(engagement.targetDate)}
          </p>
          {engagement.notes && (
            <p className="mt-2 max-w-3xl text-sm text-slate-500">{engagement.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <form action={updateEngagementStatusAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="engagementId" value={engagement.id} />
            <select
              name="status"
              defaultValue={engagement.status}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="rounded-md border-slate-300 px-2 py-1 text-xs"
            >
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </form>
          <form action={deleteEngagementAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="engagementId" value={engagement.id} />
            <button className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50">
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* Add task form */}
      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          + Add task
        </summary>
        <form
          action={createTaskAction}
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <input type="hidden" name="engagementId" value={engagement.id} />
          <label className="block md:col-span-4">
            <span className="text-xs font-medium text-slate-700">Title *</span>
            <input
              name="title"
              required
              maxLength={200}
              placeholder="Reconcile November bank accounts"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-slate-700">Description</span>
            <input
              name="description"
              maxLength={500}
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Priority</span>
            <select
              name="priority"
              defaultValue="MED"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="LOW">Low</option>
              <option value="MED">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Due date</span>
            <input
              type="date"
              name="dueDate"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-slate-700">Assignee</span>
            <select
              name="assigneeUserId"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="">Unassigned</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Add task
            </button>
          </div>
        </form>
      </details>

      {/* Kanban */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {STATUS_COL.map((col) => {
          const tasks = tasksByStatus[col.key] ?? [];
          return (
            <div
              key={col.key}
              className={`rounded-lg border border-slate-200 ${col.color} p-3`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                  {tasks.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-xs text-slate-400">No tasks here.</p>
                ) : (
                  tasks.map((t) => {
                    const overdue =
                      t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < today;
                    const assignee = t.assigneeUserId
                      ? memberById.get(t.assigneeUserId)
                      : null;
                    return (
                      <div
                        key={t.id}
                        className="rounded-md border border-slate-200 bg-white p-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">{t.title}</p>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${PRIORITY_BADGE[t.priority]}`}
                          >
                            {t.priority}
                          </span>
                        </div>
                        {t.description && (
                          <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            {assignee ? `@${assignee}` : "Unassigned"}
                            {t.dueDate && (
                              <>
                                {" "}·{" "}
                                <span className={overdue ? "text-rose-700 font-medium" : ""}>
                                  Due {fmtDate(t.dueDate)}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <form action={updateTaskStatusAction} className="flex">
                            <input type="hidden" name="tenantSlug" value={params.tenant} />
                            <input type="hidden" name="taskId" value={t.id} />
                            <select
                              name="status"
                              defaultValue={t.status}
                              onChange={(e) => e.currentTarget.form?.requestSubmit()}
                              className="rounded border-slate-200 px-1 py-0.5 text-[11px]"
                            >
                              <option value="TODO">To do</option>
                              <option value="IN_PROGRESS">In progress</option>
                              <option value="BLOCKED">Blocked</option>
                              <option value="DONE">Done</option>
                            </select>
                          </form>
                          <form action={deleteTaskAction} className="ml-auto">
                            <input type="hidden" name="tenantSlug" value={params.tenant} />
                            <input type="hidden" name="taskId" value={t.id} />
                            <button className="rounded text-[11px] text-rose-500 hover:text-rose-700">
                              ✕
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
