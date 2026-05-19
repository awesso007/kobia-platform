import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import {
  pauseRecurringInvoice,
  resumeRecurringInvoice,
  cancelRecurringInvoice,
  runRecurringNow,
  processDueNow,
} from "@/app/actions/recurring-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-slate-100 text-slate-700",
  CANCELED: "bg-rose-100 text-rose-800",
};

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
};

export default async function RecurringInvoicesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const schedules = await db.recurringInvoice.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    include: {
      customer: { select: { name: true } },
      lines: { select: { quantityMilli: true, unitPriceCents: true } },
      _count: { select: { runs: true } },
    },
    orderBy: [{ status: "asc" }, { nextRunDate: "asc" }],
  });

  // Summary
  const activeCount = schedules.filter((s) => s.status === "ACTIVE").length;
  const dueNow = schedules.filter(
    (s) => s.status === "ACTIVE" && s.nextRunDate <= new Date()
  ).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/ar/invoices`}
          className="hover:text-slate-700"
        >
          ← Back to invoices
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Recurring Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Auto-generate invoices on a schedule. {activeCount} active ·{" "}
            {dueNow} due now.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dueNow > 0 ? (
            <form action={processDueNow}>
              <input type="hidden" name="tenantSlug" value={params.tenant} />
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Run {dueNow} due now
              </button>
            </form>
          ) : null}
          <Link
            href={`/${params.tenant}/ar/recurring/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New schedule
          </Link>
        </div>
      </div>

      {schedules.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            No recurring schedules yet
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Set up a schedule once — KOBIA generates and posts the invoice on
            every run.
          </p>
          <Link
            href={`/${params.tenant}/ar/recurring/new`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create first schedule
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Frequency</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Next run</th>
                <th className="px-3 py-2 text-right font-medium">Runs</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((s) => {
                const totalCents = s.lines.reduce(
                  (sum, l) =>
                    sum + (l.quantityMilli * l.unitPriceCents) / 1000n,
                  0n
                );
                const isDue =
                  s.status === "ACTIVE" && s.nextRunDate <= new Date();
                return (
                  <tr key={s.id} className="text-sm">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {s.name}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {s.customer.name}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {FREQUENCY_LABEL[s.frequency]}
                      {s.intervalCount > 1 ? ` ×${s.intervalCount}` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatCents(totalCents)}
                      <span className="ml-1 text-xs text-slate-500">
                        {s.currency}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <span className={isDue ? "text-rose-700 font-medium" : ""}>
                        {s.nextRunDate.toISOString().slice(0, 10)}
                      </span>
                      {isDue ? (
                        <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-xs text-rose-800">
                          due
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {s.runsCompleted}
                      {s.maxRuns ? `/${s.maxRuns}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[s.status] ?? "bg-slate-100"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {s.status === "ACTIVE" && isDue ? (
                          <form action={runRecurringNow}>
                            <input
                              type="hidden"
                              name="tenantSlug"
                              value={params.tenant}
                            />
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                            >
                              Run now
                            </button>
                          </form>
                        ) : null}
                        {s.status === "ACTIVE" ? (
                          <form action={pauseRecurringInvoice}>
                            <input
                              type="hidden"
                              name="tenantSlug"
                              value={params.tenant}
                            />
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-amber-700 hover:text-amber-800"
                            >
                              Pause
                            </button>
                          </form>
                        ) : null}
                        {s.status === "PAUSED" ? (
                          <form action={resumeRecurringInvoice}>
                            <input
                              type="hidden"
                              name="tenantSlug"
                              value={params.tenant}
                            />
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                            >
                              Resume
                            </button>
                          </form>
                        ) : null}
                        {(s.status === "ACTIVE" || s.status === "PAUSED") ? (
                          <form action={cancelRecurringInvoice}>
                            <input
                              type="hidden"
                              name="tenantSlug"
                              value={params.tenant}
                            />
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-rose-700 hover:text-rose-800"
                            >
                              Cancel
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Schedules run when you click &ldquo;Run due now&rdquo;. Auto-runs on a
        scheduled cron come next.
      </p>
    </div>
  );
}
