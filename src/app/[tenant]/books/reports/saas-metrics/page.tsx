import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { getSaasMetrics } from "@/lib/accounting/saas-metrics";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

export default async function SaasMetricsPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { asOf?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const asOf = searchParams.asOf ? new Date(searchParams.asOf) : new Date();
  const asOfStr = asOf.toISOString().slice(0, 10);

  const metrics = await getSaasMetrics({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    asOf,
  });

  // Find max MRR for chart scaling
  const maxMrr = metrics.mrrHistory.reduce((m, h) => (h.mrrCents > m ? h.mrrCents : m), 1n);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SaaS Metrics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Recurring revenue snapshot from active subscriptions in {entity.name}.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">As of</span>
            <input
              type="date"
              name="asOf"
              defaultValue={asOfStr}
              className="mt-1 rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Update
          </button>
        </form>
      </div>

      {metrics.activeSubscriptions === 0 ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-900">No recurring subscriptions yet</h2>
          <p className="mt-2 text-sm text-amber-800">
            Set up your first recurring invoice to start tracking MRR, ARR, and churn.
          </p>
          <Link
            href={`/${params.tenant}/ar/recurring`}
            className="mt-4 inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Create recurring invoice
          </Link>
        </div>
      ) : (
        <>
          {/* Top KPI row */}
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Kpi label="MRR" value={formatCents(metrics.mrrCents)} accent />
            <Kpi label="ARR" value={formatCents(metrics.arrCents)} />
            <Kpi label="Active subscriptions" value={String(metrics.activeSubscriptions)} />
            <Kpi label="Active customers" value={String(metrics.activeCustomers)} />
          </div>

          {/* Secondary KPIs */}
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Kpi
              label="New MRR this month"
              value={formatCents(metrics.newMrrCents)}
              tone="positive"
            />
            <Kpi
              label="Churned MRR this month"
              value={formatCents(metrics.churnedMrrCents)}
              tone={metrics.churnedMrrCents > 0n ? "negative" : "neutral"}
            />
            <Kpi
              label="Net new MRR"
              value={formatCents(metrics.netNewMrrCents)}
              tone={
                metrics.netNewMrrCents > 0n
                  ? "positive"
                  : metrics.netNewMrrCents < 0n
                    ? "negative"
                    : "neutral"
              }
            />
            <Kpi label="ARPU (per customer)" value={formatCents(metrics.arpuCents)} />
          </div>

          {/* 12-month chart */}
          <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">MRR — last 12 months</h2>
              <span className="text-xs text-slate-500">ACV (avg contract) = {formatCents(metrics.acvCents)}</span>
            </div>
            <div className="mt-6 flex h-48 items-end justify-between gap-1">
              {metrics.mrrHistory.map((h) => {
                const heightPct =
                  Number((h.mrrCents * 100n) / (maxMrr > 0n ? maxMrr : 1n)) || 0;
                return (
                  <div key={h.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full text-center text-[10px] font-mono tabular-nums text-slate-400">
                      {h.mrrCents > 0n ? formatCents(h.mrrCents).replace(".00", "") : ""}
                    </div>
                    <div
                      className="w-full rounded-t bg-indigo-500"
                      style={{ height: `${Math.max(heightPct, 1)}%` }}
                      title={`${h.month}: ${formatCents(h.mrrCents)}`}
                    />
                    <div className="w-full text-center text-[10px] text-slate-500">
                      {h.month.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-right text-[11px] text-slate-400">
              {metrics.mrrHistory[0]?.month} → {metrics.mrrHistory[metrics.mrrHistory.length - 1]?.month}
            </div>
          </div>

          {/* New / churn detail per month */}
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 text-left font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">MRR</th>
                  <th className="px-4 py-2 text-right font-medium">New subs</th>
                  <th className="px-4 py-2 text-right font-medium">Churned subs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.mrrHistory.map((h) => (
                  <tr key={h.month}>
                    <td className="px-4 py-2 text-sm text-slate-700">{h.month}</td>
                    <td className="px-4 py-2 text-right font-mono text-sm tabular-nums">
                      {formatCents(h.mrrCents)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-emerald-700">
                      {h.newSubs > 0 ? `+${h.newSubs}` : ""}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-rose-700">
                      {h.churnedSubs > 0 ? `−${h.churnedSubs}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-medium text-slate-700">How this is calculated</p>
            <p className="mt-1">
              MRR sums the monthly-equivalent value of every ACTIVE recurring invoice as of {asOfStr}.
              Weekly schedules use 52/12 to normalize; quarterly divides by 3; annual divides by 12.
              ARR = MRR × 12. Churn counts subscriptions canceled (status CANCELED) or naturally
              ended (status COMPLETED past endDate) within the month.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-700"
        : "text-slate-900";
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        accent ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
