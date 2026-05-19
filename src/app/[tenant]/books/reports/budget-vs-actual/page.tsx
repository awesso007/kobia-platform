import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import { buildBudgetVsActual } from "@/lib/accounting/budget";

export const dynamic = "force-dynamic";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default async function BudgetVsActualPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { budgetId?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const budgets = await db.budget.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    select: { id: true, name: true, fiscalYear: true },
    orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
  });

  const budgetId = searchParams.budgetId ?? budgets[0]?.id ?? "";

  if (!budgetId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-4 text-sm text-slate-500">
          <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
            ← Back to books
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Budget vs Actual
        </h1>
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            No budgets created yet. Set one up first.
          </p>
          <Link
            href={`/${params.tenant}/books/budget`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create budget
          </Link>
        </div>
      </div>
    );
  }

  const report = await buildBudgetVsActual({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    budgetId,
  });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Budget vs Actual
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            FY{report.fiscalYear} · {report.rows.length} accounts
          </p>
        </div>
        <form method="GET" className="flex items-end gap-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Budget</span>
            <select
              name="budgetId"
              defaultValue={budgetId}
              className="mt-1 block rounded-md border-slate-300 px-3 py-2 text-sm"
            >
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (FY{b.fiscalYear})
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="YTD Budget" cents={report.totals.ytdBudget} />
        <SummaryCard label="YTD Actual" cents={report.totals.ytdActual} />
        <SummaryCard
          label="YTD Variance"
          cents={report.totals.ytdVariance}
          tone={report.totals.ytdVariance >= 0n ? "rose" : "emerald"}
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 text-left font-medium sticky left-0 bg-slate-50">
                Account
              </th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">YTD Bud</th>
              <th className="px-2 py-2 text-right font-medium">YTD Act</th>
              <th className="px-2 py-2 text-right font-medium">Var</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.rows.map((r) => (
              <tr key={r.accountId}>
                <td className="px-2 py-1.5 text-slate-700 sticky left-0 bg-white">
                  <span className="font-mono text-slate-500">{r.code}</span>{" "}
                  <span className="font-medium">{r.name}</span>
                </td>
                {r.monthly.map((m, i) => (
                  <td
                    key={i}
                    className="px-2 py-1.5 text-right font-mono tabular-nums"
                    title={`Budget ${formatCents(m.budget)} / Actual ${formatCents(m.actual)}`}
                  >
                    <div className="text-slate-500">{formatCents(m.budget)}</div>
                    <div
                      className={`font-medium ${
                        m.variance > 0n
                          ? "text-rose-700"
                          : m.variance < 0n
                          ? "text-emerald-700"
                          : "text-slate-700"
                      }`}
                    >
                      {formatCents(m.actual)}
                    </div>
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-700">
                  {formatCents(r.ytdBudget)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-900 font-semibold">
                  {formatCents(r.ytdActual)}
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono tabular-nums font-semibold ${
                    r.ytdVariance > 0n
                      ? "text-rose-700"
                      : r.ytdVariance < 0n
                      ? "text-emerald-700"
                      : "text-slate-700"
                  }`}
                >
                  {formatCents(r.ytdVariance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Each cell shows budget (grey, top) vs actual (bold, bottom). Variance =
        actual − budget. Positive = over budget (red for expenses), negative =
        under (green for expenses).
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: bigint;
  tone?: "rose" | "emerald";
}) {
  const toneClass = tone
    ? {
        rose: "border-rose-200 bg-rose-50 text-rose-900",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
      }[tone]
    : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold font-mono tabular-nums">
        {formatCents(cents)}
      </div>
    </div>
  );
}
