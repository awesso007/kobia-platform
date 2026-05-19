import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { listPeriods } from "@/lib/accounting/periods";
import { db } from "@/lib/db";
import {
  backfillPeriodsAction,
  closePeriodAction,
  reopenPeriodAction,
} from "@/app/actions/period-actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PeriodClosePage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Period Close</h1>
        <p className="mt-2 text-sm text-slate-600">Select or create an entity first.</p>
      </div>
    );
  }

  const periods = await listPeriods(entity.id);

  // Per-period entry counts (posted + draft) to show in the UI
  const counts = new Map<string, { posted: number; draft: number }>();
  for (const p of periods) {
    const [posted, draft] = await Promise.all([
      db.journalEntry.count({
        where: {
          entityId: entity.id,
          entryDate: { gte: p.startDate, lte: p.endDate },
          status: "POSTED",
        },
      }),
      db.journalEntry.count({
        where: {
          entityId: entity.id,
          entryDate: { gte: p.startDate, lte: p.endDate },
          status: "DRAFT",
        },
      }),
    ]);
    counts.set(p.id, { posted, draft });
  }

  const openCount = periods.filter((p) => p.status === "OPEN").length;
  const closedCount = periods.length - openCount;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Period Close
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Lock historical periods to prevent backdated entries. Audit-grade close workflow for {entity.name}.
          </p>
        </div>

        <form action={backfillPeriodsAction}>
          <input type="hidden" name="slug" value={params.tenant} />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Generate missing periods
          </button>
        </form>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <SummaryCard label="Open periods" value={openCount} tone="open" />
        <SummaryCard label="Closed periods" value={closedCount} tone="closed" />
        <SummaryCard label="Total periods" value={periods.length} tone="neutral" />
      </div>

      {/* Periods table */}
      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Range</th>
              <th className="px-4 py-3">Entries</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Closed</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {periods.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No periods yet. Click <em>Generate missing periods</em> to backfill from your first journal entry.
                </td>
              </tr>
            )}
            {periods.map((p) => {
              const c = counts.get(p.id) ?? { posted: 0, draft: 0 };
              return (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.label}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {fmtDate(p.startDate)} &mdash; {fmtDate(p.endDate)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {c.posted} posted
                    {c.draft > 0 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        {c.draft} draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === "CLOSED" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                        Closed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Open
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {p.status === "CLOSED" ? fmtDateTime(p.closedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "OPEN" ? (
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-[color:var(--primary,#0ea5e9)] hover:underline">
                          Close period
                        </summary>
                        <form action={closePeriodAction} className="mt-3 space-y-2 text-left">
                          <input type="hidden" name="slug" value={params.tenant} />
                          <input type="hidden" name="periodId" value={p.id} />
                          <textarea
                            name="closingNote"
                            placeholder="Optional closing note (reconciliation reference, reviewer, etc.)"
                            rows={2}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          {c.draft > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              {c.draft} draft entr{c.draft === 1 ? "y" : "ies"} must be posted or discarded first.
                            </p>
                          )}
                          <button
                            type="submit"
                            disabled={c.draft > 0}
                            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                          >
                            Confirm close
                          </button>
                        </form>
                      </details>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-amber-600 hover:underline dark:text-amber-400">
                          Reopen
                        </summary>
                        <form action={reopenPeriodAction} className="mt-3 space-y-2 text-left">
                          <input type="hidden" name="slug" value={params.tenant} />
                          <input type="hidden" name="periodId" value={p.id} />
                          <textarea
                            name="reason"
                            required
                            minLength={5}
                            placeholder="Why are you reopening this period? (logged in audit trail)"
                            rows={2}
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          {p.reopenedAt && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Previously reopened {fmtDateTime(p.reopenedAt)}
                              {p.reopenReason && (
                                <span>
                                  : <em>{p.reopenReason}</em>
                                </span>
                              )}
                            </p>
                          )}
                          <button
                            type="submit"
                            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
                          >
                            Reopen period
                          </button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        Closing a period locks every posted journal entry inside it. Reports for that range freeze and cannot drift.
        Reopening is allowed but always logged with a reason for your audit trail.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "open" | "closed" | "neutral";
}) {
  const toneCls =
    tone === "open"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "closed"
        ? "text-slate-700 dark:text-slate-300"
        : "text-slate-900 dark:text-slate-50";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}
