import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import {
  buildTrialBalance,
  toBalanceStyleRows,
} from "@/lib/accounting/trial-balance";

export const dynamic = "force-dynamic";

/** Trial Balance — Dr/Cr balance per account as of a date. */
export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { entity?: string; asOf?: string; gross?: string };
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
          Trial Balance
        </h1>
        <p className="mt-2 text-sm text-slate-600">No entities yet.</p>
      </div>
    );
  }

  // Default asOf = today
  const asOfDate = searchParams.asOf
    ? new Date(searchParams.asOf + "T23:59:59")
    : new Date();
  const asOfStr = asOfDate.toISOString().slice(0, 10);

  // gross=1 means show gross debits/credits (activity), default = balance style
  const showGross = searchParams.gross === "1";

  const tb = await buildTrialBalance({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    asOfDate,
  });

  const balanceRows = toBalanceStyleRows(tb);

  // Group rows by account type for grouped display
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

  // For balance-style totals
  const balanceTotalDr = balanceRows.reduce((s, r) => s + r.drBalance, 0n);
  const balanceTotalCr = balanceRows.reduce((s, r) => s + r.crBalance, 0n);
  const balanceMatched = balanceTotalDr === balanceTotalCr;

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

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Trial Balance
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {entity.name} · as of {asOfStr}
            {entity.baseCurrency ? ` · ${entity.baseCurrency}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="entity" value={entity.id} />
            {showGross ? (
              <input type="hidden" name="gross" value="1" />
            ) : null}
            <label className="text-xs text-slate-600">As of</label>
            <input
              type="date"
              name="asOf"
              defaultValue={asOfStr}
              className="rounded-md border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              Refresh
            </button>
          </form>
          <Link
            href={`/${params.tenant}/books/reports/trial-balance?entity=${entity.id}&asOf=${asOfStr}&gross=${showGross ? "" : "1"}`}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {showGross ? "Show balances" : "Show gross activity"}
          </Link>
          <Link
            href={`/api/reports/trial-balance.csv?entity=${entity.id}&asOf=${asOfStr}${showGross ? "&gross=1" : ""}`}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Export CSV
          </Link>
        </div>
      </div>

      {/* Status banner */}
      <div
        className={`mt-4 rounded-md border p-3 text-sm ${
          tb.balanced
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-300 bg-rose-50 text-rose-900"
        }`}
      >
        {tb.balanced ? (
          <>
            <span className="font-semibold">Balanced.</span> Total debits =
            total credits ={" "}
            <span className="font-mono">{formatCents(tb.totalDebits)}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">Out of balance.</span> Debits{" "}
            <span className="font-mono">
              {formatCents(tb.totalDebits)}
            </span>{" "}
            vs credits{" "}
            <span className="font-mono">
              {formatCents(tb.totalCredits)}
            </span>{" "}
            (difference{" "}
            <span className="font-mono">
              {formatCents(tb.difference)}
            </span>
            ). This indicates a posting error in the ledger.
          </>
        )}
      </div>

      {tb.rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
          No posted activity through this date.
        </div>
      ) : showGross ? (
        // GROSS view: show total debits and total credits (activity) per account
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Account</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">
                  Total Debits
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  Total Credits
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tb.rows.map((r) => (
                <tr key={r.accountId} className="text-sm">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">
                    {r.code}
                  </td>
                  <td className="px-4 py-2 text-slate-900">{r.name}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {r.type}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {r.debitCents > 0n ? formatCents(r.debitCents) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {r.creditCents > 0n ? formatCents(r.creditCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr className="text-sm font-semibold text-slate-900">
                <td colSpan={3} className="px-4 py-2 text-right">
                  Totals
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {formatCents(tb.totalDebits)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {formatCents(tb.totalCredits)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        // BALANCE view: grouped by type, Dr/Cr columns showing natural-side balance
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Account</th>
                <th className="px-4 py-2 text-right font-medium">Debit</th>
                <th className="px-4 py-2 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TYPE_ORDER.map(({ type, label }) => {
                const groupRows = balanceRows.filter((r) => r.type === type);
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
                    {groupRows.map((r) => (
                      <tr key={r.accountId} className="text-sm">
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">
                          {r.code}
                        </td>
                        <td className="px-4 py-2 text-slate-900">{r.name}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {r.drBalance > 0n
                            ? formatCents(r.drBalance)
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">
                          {r.crBalance > 0n
                            ? formatCents(r.crBalance)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr className="text-sm font-semibold text-slate-900">
                <td colSpan={2} className="px-4 py-2 text-right">
                  Totals
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {formatCents(balanceTotalDr)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {formatCents(balanceTotalCr)}
                </td>
              </tr>
              {!balanceMatched ? (
                <tr className="text-xs text-rose-700">
                  <td colSpan={4} className="px-4 py-2 text-right">
                    Balance-style totals do not match — recheck account types
                    and signs.
                  </td>
                </tr>
              ) : null}
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Trial balance includes every posted journal entry through end of day{" "}
        {asOfStr}. Draft entries are excluded.
      </p>
    </div>
  );
}
