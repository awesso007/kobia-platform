import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import { buildGeneralLedger } from "@/lib/accounting/general-ledger";

export const dynamic = "force-dynamic";

/**
 * General Ledger — drill-down view by account.
 *
 * Without ?account, shows a list of all accounts with current balance.
 * With ?account=<id>, shows every posted line for that account in the date
 * range, with running balance.
 */
export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: {
    entity?: string;
    account?: string;
    start?: string;
    end?: string;
  };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  let entity = null;
  if (searchParams.entity) {
    entity = await db.entity.findFirst({
      where: {
        id: searchParams.entity,
        tenantId: auth.tenant.id,
        isActive: true,
      },
    });
  }
  if (!entity) {
    entity = await getActiveEntity({
      tenantId: auth.tenant.id,
      tenantSlug: params.tenant,
    });
  }
  if (!entity) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          General Ledger
        </h1>
        <p className="mt-2 text-sm text-slate-600">No entities yet.</p>
      </div>
    );
  }

  // Date range defaults: current fiscal-year-to-date
  // Default start = Jan 1 current year, end = today
  const today = new Date();
  const defaultStart = searchParams.start
    ? new Date(searchParams.start + "T00:00:00")
    : new Date(today.getFullYear(), 0, 1);
  const defaultEnd = searchParams.end
    ? new Date(searchParams.end + "T23:59:59")
    : today;

  const startStr = defaultStart.toISOString().slice(0, 10);
  const endStr = defaultEnd.toISOString().slice(0, 10);

  // === ACCOUNT INDEX VIEW ===
  if (!searchParams.account) {
    const accounts = await db.account.findMany({
      where: { tenantId: auth.tenant.id, entityId: entity.id, isActive: true },
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });

    // Group by type
    const TYPE_ORDER: Array<{ type: string; label: string }> = [
      { type: "ASSET", label: "Assets" },
      { type: "LIABILITY", label: "Liabilities" },
      { type: "EQUITY", label: "Equity" },
      { type: "REVENUE", label: "Revenue" },
      { type: "OTHER_INCOME", label: "Other Income" },
      { type: "EXPENSE", label: "Expenses" },
      { type: "COGS", label: "Cost of Goods Sold" },
      { type: "OTHER_EXPENSE", label: "Other Expenses" },
    ];

    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-4 text-sm text-slate-500">
          <Link
            href={`/${params.tenant}/books`}
            className="hover:text-slate-700"
          >
            ← Back to books
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          General Ledger
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {entity.name} · select an account to see its transaction history
          {entity.baseCurrency ? ` · ${entity.baseCurrency}` : ""}
        </p>

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Account</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TYPE_ORDER.map(({ type, label }) => {
                const groupRows = accounts.filter((a) => a.type === type);
                if (groupRows.length === 0) return null;
                return (
                  <>
                    <tr key={`group-${type}`} className="bg-slate-50/60">
                      <td
                        colSpan={4}
                        className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700"
                      >
                        {label}
                      </td>
                    </tr>
                    {groupRows.map((a) => (
                      <tr key={a.id} className="text-sm">
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">
                          {a.code}
                        </td>
                        <td className="px-4 py-2 text-slate-900">{a.name}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {formatCents(a.balanceCents)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/${params.tenant}/books/reports/general-ledger?entity=${entity.id}&account=${a.id}&start=${startStr}&end=${endStr}`}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            View activity →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // === SINGLE ACCOUNT DRILLDOWN ===
  const gl = await buildGeneralLedger({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    accountId: searchParams.account,
    startDate: defaultStart,
    endDate: defaultEnd,
  });

  if (!gl) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-rose-700">Account not found.</p>
        <Link
          href={`/${params.tenant}/books/reports/general-ledger?entity=${entity.id}`}
          className="text-sm text-indigo-600 hover:text-indigo-700"
        >
          ← Back to account list
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/books/reports/general-ledger?entity=${entity.id}&start=${startStr}&end=${endStr}`}
          className="hover:text-slate-700"
        >
          ← All accounts
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {gl.code} · {gl.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {entity.name} · {gl.type} · {startStr} to {endStr}
            {entity.baseCurrency ? ` · ${entity.baseCurrency}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="entity" value={entity.id} />
            <input type="hidden" name="account" value={gl.accountId} />
            <input
              type="date"
              name="start"
              defaultValue={startStr}
              className="rounded-md border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              name="end"
              defaultValue={endStr}
              className="rounded-md border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              Filter
            </button>
          </form>
          <Link
            href={`/api/reports/general-ledger.csv?entity=${entity.id}&account=${gl.accountId}&start=${startStr}&end=${endStr}`}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Export CSV
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Opening
          </div>
          <div className="mt-1 font-mono text-sm tabular-nums text-slate-900">
            {formatCents(gl.openingBalance)}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Debits
          </div>
          <div className="mt-1 font-mono text-sm tabular-nums text-slate-900">
            {formatCents(gl.totalDebits)}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Credits
          </div>
          <div className="mt-1 font-mono text-sm tabular-nums text-slate-900">
            {formatCents(gl.totalCredits)}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Closing
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-900">
            {formatCents(gl.closingBalance)}
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">JE #</th>
              <th className="px-3 py-2 text-left font-medium">Source</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/60 text-sm">
              <td colSpan={6} className="px-3 py-2 text-right text-slate-600">
                Opening balance
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                {formatCents(gl.openingBalance)}
              </td>
            </tr>
            {gl.lines.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-sm text-slate-500"
                >
                  No activity in this period.
                </td>
              </tr>
            ) : (
              gl.lines.map((l) => (
                <tr key={l.lineId} className="text-sm">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {l.entryDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      href={`/${params.tenant}/books/journal/${l.entryId}`}
                      className="text-indigo-600 hover:text-indigo-700"
                    >
                      #{l.entryNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {l.source}
                  </td>
                  <td className="px-3 py-2 text-slate-900">
                    {l.description ?? l.lineMemo ?? l.memo ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {l.debitCents > 0n ? formatCents(l.debitCents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {l.creditCents > 0n ? formatCents(l.creditCents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(l.runningBalance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr className="text-sm font-semibold text-slate-900">
              <td colSpan={4} className="px-3 py-2 text-right">
                Closing balance
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatCents(gl.totalDebits)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatCents(gl.totalCredits)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatCents(gl.closingBalance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
