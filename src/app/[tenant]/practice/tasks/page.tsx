import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateTaskStatusAction } from "@/app/actions/practice-actions";

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

const STATUS_BADGE: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-sky-100 text-sky-800",
  BLOCKED: "bg-amber-100 text-amber-800",
  DONE: "bg-emerald-100 text-emerald-800",
};

export default async function MyTasksPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { scope?: string; status?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const scope = searchParams?.scope ?? "MINE"; // MINE | ALL
  const statusFilter = searchParams?.status ?? "OPEN"; // OPEN | DONE | ALL

  const statusWhere =
    statusFilter === "OPEN"
      ? { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] as Array<"TODO" | "IN_PROGRESS" | "BLOCKED"> } }
      : statusFilter === "DONE"
        ? { status: "DONE" as const }
        : {};

  const where = {
    tenantId: auth.tenant.id,
    ...statusWhere,
    ...(scope === "MINE" ? { assigneeUserId: auth.user.id } : {}),
  };

  const tasks = await db.task.findMany({
    where,
    include: {
      engagement: {
        select: {
          id: true,
          name: true,
          entity: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { priority: "desc" }],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter(
    (t) => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < today,
  ).length;

  // Resolve assignee labels in one shot.
  const userIds = Array.from(
    new Set(tasks.map((t) => t.assigneeUserId).filter((x): x is string => !!x)),
  );
  const members =
    userIds.length === 0
      ? []
      : await db.membership.findMany({
          where: { tenantId: auth.tenant.id, userId: { in: userIds } },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });
  const memberLabel = new Map<string, string>(
    members.map((m) => [
      m.user.id,
      [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email,
    ]),
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="text-xs text-slate-500">
        <Link href={`/${params.tenant}/practice`} className="hover:text-slate-700">
          ← Practice
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        {scope === "MINE" ? "My tasks" : "All firm tasks"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {tasks.length} task{tasks.length === 1 ? "" : "s"}
        {overdue > 0 && (
          <>
            {" "}·{" "}
            <span className="font-medium text-rose-700">{overdue} overdue</span>
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          { value: "MINE", label: "Assigned to me" },
          { value: "ALL", label: "All firm" },
        ].map((tab) => {
          const active = scope === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/${params.tenant}/practice/tasks?scope=${tab.value}&status=${statusFilter}`}
              className={`rounded-full px-3 py-1 ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        <span className="mx-2 text-slate-300">|</span>
        {[
          { value: "OPEN", label: "Open" },
          { value: "DONE", label: "Done" },
          { value: "ALL", label: "All" },
        ].map((tab) => {
          const active = statusFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/${params.tenant}/practice/tasks?scope=${scope}&status=${tab.value}`}
              className={`rounded-full px-3 py-1 ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No tasks match this filter.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium">Engagement · Client</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Assignee</th>
                <th className="px-4 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const overdue =
                  t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < today;
                return (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{t.title}</p>
                      {t.description && (
                        <p className="line-clamp-1 text-xs text-slate-500">
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      <Link
                        href={`/${params.tenant}/practice/engagements/${t.engagement.id}`}
                        className="hover:underline"
                      >
                        {t.engagement.name}
                      </Link>
                      <p className="text-slate-400">{t.engagement.entity.name}</p>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${PRIORITY_BADGE[t.priority]}`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <form action={updateTaskStatusAction} className="inline">
                        <input type="hidden" name="tenantSlug" value={params.tenant} />
                        <input type="hidden" name="taskId" value={t.id} />
                        <select
                          name="status"
                          defaultValue={t.status}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[t.status]}`}
                        >
                          <option value="TODO">TO DO</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="BLOCKED">BLOCKED</option>
                          <option value="DONE">DONE</option>
                        </select>
                      </form>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {t.assigneeUserId
                        ? memberLabel.get(t.assigneeUserId) ?? "—"
                        : "Unassigned"}
                    </td>
                    <td
                      className={`px-4 py-2 text-xs ${overdue ? "font-medium text-rose-700" : "text-slate-600"}`}
                    >
                      {fmtDate(t.dueDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
