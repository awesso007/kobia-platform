import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { getClassPnlReport } from "@/lib/accounting/class-pnl";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ClassPnlPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { from?: string; to?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodStart = searchParams.from ? new Date(searchParams.from) : yearStart;
  const periodEnd = searchParams.to ? new Date(searchParams.to) : now;

  const report = await getClassPnlReport({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    periodStart,
    periodEnd,
  });

  const hasAnyTransactions =
    report.revenueRows.length > 0 || report.expenseRows.length > 0;
  // Hide Unclassified column if it has no activity
  const visibleClasses = report.classes.filter((cls) => {
    if (cls !== "(Unclassified)") return true;
    const rev = report.totalsByClass.revenueByClass[cls] ?? 0n;
    const exp = report.totalsByClass.expenseByClass[cls] ?? 0n;
    return rev !== 0n || exp !== 0n;
  });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profit & Loss by Class</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {fmtDate(periodStart)} → {fmtDate(periodEnd)}
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">From</span>
            <input
              type="date"
              name="from"
              defaultValue={fmtDate(periodStart)}
              className="mt-1 rounded-md border-slate-300 px-2 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">To</span>
            <input
              type="date"
              name="to"
              defaultValue={fmtDate(periodEnd)}
              className="mt-1 rounded-md border-slate-300 px-2 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Update
          </button>
        </form>
      </div>

      {!hasAnyTransactions ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-900">No P&L activity in this period</h2>
          <p className="mt-2 text-sm text-amber-800">
            Post some revenue and expense entries to see class profitability.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-left font-medium">
                    Account
                  </th>
                  {visibleClasses.map((cls) => (
                    <th key={cls} className="px-4 py-2 text-right font-medium">
                      {cls}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-emerald-50/50">
                  <td
                    className="sticky left-0 z-10 bg-emerald-50/50 px-4 py-2 text-xs uppercase tracking-wide font-semibold text-emerald-900"
                    colSpan={visibleClasses.length + 2}
                  >
                    Revenue
                  </td>
                </tr>
                {report.revenueRows.length === 0 ? (
                  <tr>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 text-sm text-slate-500">
                      No revenue
                    </td>
                    {visibleClasses.map((cls) => (
                      <td key={cls} />
                    ))}
                    <td />
                  </tr>
                ) : (
                  report.revenueRows.map((row) => (
                    <tr key={row.accountId}>
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 text-sm text-slate-700">
                        <span className="font-mono text-xs text-slate-500">{row.accountCode}</span>
                        <span className="ml-2">{row.accountName}</span>
                      </td>
                      {visibleClasses.map((cls) => (
                        <td
                          key={cls}
                          className="px-4 py-2 text-right font-mono text-sm tabular-nums text-slate-900"
                        >
                          {row.amountsByClass[cls] !== 0n
                            ? formatCents(row.amountsByClass[cls] ?? 0n)
                            : ""}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                        {formatCents(row.total)}
                      </td>
                    </tr>
                  ))
                )}
                <tr className="bg-emerald-50 font-semibold">
                  <td className="sticky left-0 z-10 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
                    Total Revenue
                  </td>
                  {visibleClasses.map((cls) => (
                    <td
                      key={cls}
                      className="px-4 py-2 text-right font-mono text-sm tabular-nums text-emerald-900"
                    >
                      {formatCents(report.totalsByClass.revenueByClass[cls] ?? 0n)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-emerald-900">
                    {formatCents(report.grandTotals.revenue)}
                  </td>
                </tr>

                <tr className="bg-rose-50/50">
                  <td
                    className="sticky left-0 z-10 bg-rose-50/50 px-4 py-2 text-xs uppercase tracking-wide font-semibold text-rose-900"
                    colSpan={visibleClasses.length + 2}
                  >
                    Expense
                  </td>
                </tr>
                {report.expenseRows.length === 0 ? (
                  <tr>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 text-sm text-slate-500">
                      No expenses
                    </td>
                    {visibleClasses.map((cls) => (
                      <td key={cls} />
                    ))}
                    <td />
                  </tr>
                ) : (
                  report.expenseRows.map((row) => (
                    <tr key={row.accountId}>
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 text-sm text-slate-700">
                        <span className="font-mono text-xs text-slate-500">{row.accountCode}</span>
                        <span className="ml-2">{row.accountName}</span>
                      </td>
                      {visibleClasses.map((cls) => (
                        <td
                          key={cls}
                          className="px-4 py-2 text-right font-mono text-sm tabular-nums text-slate-900"
                        >
                          {row.amountsByClass[cls] !== 0n
                            ? formatCents(row.amountsByClass[cls] ?? 0n)
                            : ""}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                        {formatCents(row.total)}
                      </td>
                    </tr>
                  ))
                )}
                <tr className="bg-rose-50 font-semibold">
                  <td className="sticky left-0 z-10 bg-rose-50 px-4 py-2 text-sm text-rose-900">
                    Total Expense
                  </td>
                  {visibleClasses.map((cls) => (
                    <td
                      key={cls}
                      className="px-4 py-2 text-right font-mono text-sm tabular-nums text-rose-900"
                    >
                      {formatCents(report.totalsByClass.expenseByClass[cls] ?? 0n)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-rose-900">
                    {formatCents(report.grandTotals.expense)}
                  </td>
                </tr>

                <tr className="bg-slate-100 font-bold">
                  <td className="sticky left-0 z-10 bg-slate-100 px-4 py-2 text-sm text-slate-900">
                    Net Income
                  </td>
                  {visibleClasses.map((cls) => {
                    const net = report.totalsByClass.netByClass[cls] ?? 0n;
                    return (
                      <td
                        key={cls}
                        className={`px-4 py-2 text-right font-mono text-sm tabular-nums ${
                          net < 0n ? "text-rose-700" : "text-slate-900"
                        }`}
                      >
                        {formatCents(net)}
                      </td>
                    );
                  })}
                  <td
                    className={`px-4 py-2 text-right font-mono text-sm tabular-nums ${
                      report.grandTotals.net < 0n ? "text-rose-700" : "text-slate-900"
                    }`}
                  >
                    {formatCents(report.grandTotals.net)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-medium text-slate-700">About classes</p>
            <p className="mt-1">
              Tag journal entries with a class (e.g. project, department, location) to track
              profitability by segment. Lines without a class tag fall into &ldquo;(Unclassified)&rdquo;.
              Set the class on individual journal lines or via invoice memo to surface it here.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
