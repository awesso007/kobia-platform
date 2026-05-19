import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { createEngagementAction } from "@/app/actions/practice-actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  ON_HOLD: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-rose-100 text-rose-800",
};

const TYPE_BADGE: Record<string, string> = {
  BOOKKEEPING: "bg-indigo-100 text-indigo-800",
  TAX: "bg-purple-100 text-purple-800",
  PAYROLL: "bg-pink-100 text-pink-800",
  AUDIT: "bg-slate-200 text-slate-800",
  ADVISORY: "bg-sky-100 text-sky-800",
  ONBOARDING: "bg-emerald-100 text-emerald-800",
  OTHER: "bg-slate-100 text-slate-700",
};

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { status?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const filter = searchParams?.status ?? "ACTIVE";
  const where = {
    tenantId: auth.tenant.id,
    ...(filter !== "ALL" ? { status: filter as "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED" } : {}),
  };

  const [engagements, entities, counts] = await Promise.all([
    db.engagement.findMany({
      where,
      include: {
        entity: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ status: "asc" }, { targetDate: "asc" }, { createdAt: "desc" }],
    }),
    db.entity.findMany({
      where: { tenantId: auth.tenant.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.engagement.groupBy({
      by: ["status"],
      where: { tenantId: auth.tenant.id },
      _count: { _all: true },
    }),
  ]);

  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));

  // For per-engagement open task counts, do a single grouped query
  const taskCounts = await db.task.groupBy({
    by: ["engagementId", "status"],
    where: {
      tenantId: auth.tenant.id,
      engagementId: { in: engagements.map((e) => e.id) },
    },
    _count: { _all: true },
  });
  const openTasksByEng = new Map<string, number>();
  const doneTasksByEng = new Map<string, number>();
  for (const row of taskCounts) {
    if (row.status === "DONE") {
      doneTasksByEng.set(row.engagementId, (doneTasksByEng.get(row.engagementId) ?? 0) + row._count._all);
    } else {
      openTasksByEng.set(row.engagementId, (openTasksByEng.get(row.engagementId) ?? 0) + row._count._all);
    }
  }

  const filterTabs: { value: string; label: string; count: number }[] = [
    { value: "ALL", label: "All", count: total },
    { value: "ACTIVE", label: "Active", count: byStatus.get("ACTIVE") ?? 0 },
    { value: "ON_HOLD", label: "On hold", count: byStatus.get("ON_HOLD") ?? 0 },
    { value: "COMPLETED", label: "Completed", count: byStatus.get("COMPLETED") ?? 0 },
    { value: "CANCELLED", label: "Cancelled", count: byStatus.get("CANCELLED") ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Practice management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track engagements and tasks across every client your firm serves.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/practice/tasks`}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          My tasks →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {filterTabs.map((t) => {
          const active = filter === t.value;
          return (
            <Link
              key={t.value}
              href={`/${params.tenant}/practice?status=${t.value}`}
              className={`rounded-full px-3 py-1 ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label} · {t.count}
            </Link>
          );
        })}
      </div>

      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          + New engagement
        </summary>
        <form
          action={createEngagementAction}
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-slate-700">Engagement name *</span>
            <input
              name="name"
              required
              maxLength={120}
              placeholder="2026 Tax Return — Acme Inc."
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Client (entity) *</span>
            <select
              name="entityId"
              required
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="">Choose…</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Type *</span>
            <select
              name="type"
              defaultValue="BOOKKEEPING"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="BOOKKEEPING">Bookkeeping</option>
              <option value="TAX">Tax</option>
              <option value="PAYROLL">Payroll</option>
              <option value="AUDIT">Audit</option>
              <option value="ADVISORY">Advisory</option>
              <option value="ONBOARDING">Onboarding</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Start date</span>
            <input
              type="date"
              name="startDate"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Target date</span>
            <input
              type="date"
              name="targetDate"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-medium text-slate-700">Notes</span>
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Create engagement
            </button>
          </div>
        </form>
      </details>

      {engagements.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No engagements yet. Use the form above to create your first one.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Engagement</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Tasks</th>
                <th className="px-4 py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {engagements.map((e) => {
                const open = openTasksByEng.get(e.id) ?? 0;
                const done = doneTasksByEng.get(e.id) ?? 0;
                return (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/${params.tenant}/practice/engagements/${e.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {e.name}
                      </Link>
                      {e.notes && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                          {e.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{e.entity.name}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs ${TYPE_BADGE[e.type] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs ${STATUS_BADGE[e.status] ?? "bg-slate-100"}`}
                      >
                        {e.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs">
                      <span className="font-medium text-slate-900">{open}</span>{" "}
                      <span className="text-slate-400">open · {done} done</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {fmtDate(e.targetDate)}
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
