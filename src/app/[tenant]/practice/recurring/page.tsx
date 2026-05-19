import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createRecurringEngagementAction,
  materializeAllDueAction,
} from "@/app/actions/recurring-engagement-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-slate-200 text-slate-700",
  CANCELED: "bg-rose-100 text-rose-800",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function fmtFrequency(f: string, n: number): string {
  if (n === 1) return f.toLowerCase();
  return `every ${n} ${f.toLowerCase().replace(/y$/, "ie")}s`;
}

export default async function RecurringEngagementsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const [templates, entities] = await Promise.all([
    db.recurringEngagement.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: [{ status: "asc" }, { nextRunDate: "asc" }],
      include: {
        entity: { select: { name: true } },
        _count: { select: { runs: true } },
      },
    }),
    db.entity.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();
  const dueCount = templates.filter(
    (t) => t.status === "ACTIVE" && new Date(t.nextRunDate) <= now
  ).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Recurring engagements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Templates that automatically create engagements on a schedule.
            Perfect for monthly bookkeeping or quarterly close.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/practice`}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Engagements
          </Link>
          {dueCount > 0 && (
            <form action={materializeAllDueAction}>
              <input
                type="hidden"
                name="tenantSlug"
                value={params.tenant}
              />
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Generate {dueCount} due now
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Create form */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          New recurring engagement
        </h2>
        {entities.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            You need a client first.{" "}
            <Link
              href={`/${params.tenant}/entities`}
              className="text-slate-700 underline"
            >
              Add a client →
            </Link>
          </p>
        ) : (
          <form
            action={createRecurringEngagementAction}
            className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3"
          >
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <div>
              <label className="block text-xs text-slate-600">Client</label>
              <select
                required
                name="entityId"
                defaultValue=""
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Choose…
                </option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-600">Name</label>
              <input
                required
                name="name"
                type="text"
                placeholder="Monthly Bookkeeping"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Type</label>
              <select
                name="type"
                defaultValue="BOOKKEEPING"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="BOOKKEEPING">Bookkeeping</option>
                <option value="TAX_PREP">Tax prep</option>
                <option value="PAYROLL">Payroll</option>
                <option value="ADVISORY">Advisory</option>
                <option value="AUDIT">Audit</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600">Frequency</label>
              <select
                name="frequency"
                defaultValue="MONTHLY"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="ANNUALLY">Annually</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600">
                Every N intervals
              </label>
              <input
                name="intervalCount"
                type="number"
                min={1}
                defaultValue={1}
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600">
                Day of month (1-28)
              </label>
              <input
                name="dayOfMonth"
                type="number"
                min={1}
                max={28}
                placeholder="optional"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600">
                First run date
              </label>
              <input
                required
                name="startDate"
                type="date"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600">
                End date (optional)
              </label>
              <input
                name="endDate"
                type="date"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-slate-600">
                Default tasks (one per line)
              </label>
              <textarea
                name="defaultTaskTitles"
                rows={4}
                placeholder={
                  "Reconcile bank accounts\nReview AR aging\nDeliver P&L to client"
                }
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-slate-600">Notes</label>
              <input
                name="notes"
                type="text"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Create template
              </button>
            </div>
          </form>
        )}
      </div>

      {/* List */}
      {templates.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No recurring templates yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Cadence</th>
                <th className="px-4 py-2 font-medium">Next run</th>
                <th className="px-4 py-2 font-medium">Runs</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const isDue =
                  t.status === "ACTIVE" && new Date(t.nextRunDate) <= now;
                return (
                  <tr
                    key={t.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/${params.tenant}/practice/recurring/${t.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {t.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {t.type.replace(/_/g, " ").toLowerCase()}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {t.entity.name}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {fmtFrequency(t.frequency, t.intervalCount)}
                      {t.dayOfMonth ? ` · day ${t.dayOfMonth}` : ""}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span
                        className={
                          isDue
                            ? "font-semibold text-emerald-700"
                            : "text-slate-700"
                        }
                      >
                        {fmtDate(t.nextRunDate)}
                        {isDue ? " · due" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {t.runsCompleted}
                      {t.maxRuns ? ` / ${t.maxRuns}` : ""}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs ${
                          STATUS_BADGE[t.status] ?? "bg-slate-100"
                        }`}
                      >
                        {t.status}
                      </span>
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
