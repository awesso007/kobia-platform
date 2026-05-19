import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  materializeNowAction,
  setRecurringStatusAction,
} from "@/app/actions/recurring-engagement-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-slate-200 text-slate-700",
  CANCELED: "bg-rose-100 text-rose-800",
};

const RUN_BADGE: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-rose-100 text-rose-800",
  SKIPPED: "bg-slate-200 text-slate-700",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString();
}

function fmtFrequency(f: string, n: number, dayOfMonth: number | null): string {
  const human = n === 1 ? f.toLowerCase() : `every ${n} ${f.toLowerCase()}s`;
  return dayOfMonth ? `${human} on day ${dayOfMonth}` : human;
}

export default async function RecurringDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const tmpl = await db.recurringEngagement.findFirst({
    where: { id: params.id, tenantId: auth.tenant.id },
    include: {
      entity: { select: { name: true } },
      runs: {
        orderBy: { runAt: "desc" },
        take: 50,
      },
    },
  });
  if (!tmpl) notFound();

  // Fetch the generated engagements for run history
  const generatedIds = tmpl.runs
    .map((r) => r.generatedEngagementId)
    .filter((x): x is string => !!x);
  const generated = generatedIds.length
    ? await db.engagement.findMany({
        where: { id: { in: generatedIds } },
        select: { id: true, name: true, status: true },
      })
    : [];
  const generatedById = new Map(generated.map((g) => [g.id, g]));

  const isDue =
    tmpl.status === "ACTIVE" && new Date(tmpl.nextRunDate) <= new Date();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Recurring engagement
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {tmpl.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {tmpl.entity.name} ·{" "}
            {fmtFrequency(tmpl.frequency, tmpl.intervalCount, tmpl.dayOfMonth)}
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-3 py-1 text-xs font-medium ${
            STATUS_BADGE[tmpl.status] ?? "bg-slate-100"
          }`}
        >
          {tmpl.status}
        </span>
      </div>

      <div className="mt-4">
        <Link
          href={`/${params.tenant}/practice/recurring`}
          className="text-sm text-slate-600 hover:underline"
        >
          ← All recurring
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Schedule</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Type</dt>
              <dd className="text-slate-800">
                {tmpl.type.replace(/_/g, " ").toLowerCase()}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Start date</dt>
              <dd className="text-slate-800">{fmtDate(tmpl.startDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">End date</dt>
              <dd className="text-slate-800">{fmtDate(tmpl.endDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Next run</dt>
              <dd
                className={
                  isDue
                    ? "font-semibold text-emerald-700"
                    : "text-slate-800"
                }
              >
                {fmtDate(tmpl.nextRunDate)}
                {isDue ? " · due" : ""}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Last run</dt>
              <dd className="text-slate-800">{fmtDate(tmpl.lastRunDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Runs completed</dt>
              <dd className="text-slate-800">
                {tmpl.runsCompleted}
                {tmpl.maxRuns ? ` / ${tmpl.maxRuns}` : ""}
              </dd>
            </div>
          </dl>
          {tmpl.notes && (
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              {tmpl.notes}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Controls</h2>
          {tmpl.status === "ACTIVE" && (
            <form action={materializeNowAction} className="mt-3">
              <input type="hidden" name="tenantSlug" value={params.tenant} />
              <input type="hidden" name="id" value={tmpl.id} />
              <button
                type="submit"
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Generate engagement now
              </button>
            </form>
          )}

          {tmpl.status !== "COMPLETED" && tmpl.status !== "CANCELED" && (
            <div className="mt-3 flex gap-2">
              {tmpl.status === "ACTIVE" ? (
                <form action={setRecurringStatusAction} className="flex-1">
                  <input
                    type="hidden"
                    name="tenantSlug"
                    value={params.tenant}
                  />
                  <input type="hidden" name="id" value={tmpl.id} />
                  <input type="hidden" name="status" value="PAUSED" />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                  >
                    Pause
                  </button>
                </form>
              ) : (
                <form action={setRecurringStatusAction} className="flex-1">
                  <input
                    type="hidden"
                    name="tenantSlug"
                    value={params.tenant}
                  />
                  <input type="hidden" name="id" value={tmpl.id} />
                  <input type="hidden" name="status" value="ACTIVE" />
                  <button
                    type="submit"
                    className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Resume
                  </button>
                </form>
              )}
              <form action={setRecurringStatusAction} className="flex-1">
                <input
                  type="hidden"
                  name="tenantSlug"
                  value={params.tenant}
                />
                <input type="hidden" name="id" value={tmpl.id} />
                <input type="hidden" name="status" value="CANCELED" />
                <button
                  type="submit"
                  className="w-full rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          {tmpl.defaultTaskTitles && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Default tasks
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {tmpl.defaultTaskTitles
                  .split("\n")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-slate-300">▢</span>
                      {t}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Run history</h2>
        {tmpl.runs.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
            No runs yet.
          </div>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 font-medium">Run at</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium">Generated engagement</th>
              </tr>
            </thead>
            <tbody>
              {tmpl.runs.map((r) => {
                const eng = r.generatedEngagementId
                  ? generatedById.get(r.generatedEngagementId)
                  : null;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5 text-xs text-slate-700">
                      {fmtDateTime(r.runAt)}
                    </td>
                    <td className="py-1.5">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs ${
                          RUN_BADGE[r.status] ?? "bg-slate-100"
                        }`}
                      >
                        {r.status}
                      </span>
                      {r.errorMessage && (
                        <div className="mt-0.5 text-xs text-rose-600">
                          {r.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 text-sm">
                      {eng ? (
                        <Link
                          href={`/${params.tenant}/practice/engagements/${eng.id}`}
                          className="text-slate-700 hover:underline"
                        >
                          {eng.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
