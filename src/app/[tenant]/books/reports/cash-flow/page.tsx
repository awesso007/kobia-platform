import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import { computeCashFlow, type CashFlowRow } from "@/lib/accounting/cash-flow";

export const dynamic = "force-dynamic";

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { start?: string; end?: string; entity?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  // Honor ?entity= override; otherwise active entity
  let entity = null;
  if (searchParams.entity) {
    entity = await db.entity.findFirst({
      where: { id: searchParams.entity, tenantId: auth.tenant.id, isActive: true },
    });
  }
  if (!entity) {
    entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  }
  if (!entity) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cash Flow Statement</h1>
        <p className="mt-2 text-sm text-slate-600">No entities yet.</p>
      </div>
    );
  }

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), 0, 1);
  const startDate = searchParams.start ? new Date(searchParams.start) : defaultStart;
  const endDate = searchParams.end ? new Date(searchParams.end) : now;

  const report = await computeCashFlow({
    entityId: entity.id,
    tenantId: auth.tenant.id,
    startDate,
    endDate,
  });

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const isoStart = fmtDate(startDate);
  const isoEnd = fmtDate(endDate);

  const driftAbs =
    report.reconciliationDriftCents < 0n
      ? -report.reconciliationDriftCents
      : report.reconciliationDriftCents;
  const isBalanced = driftAbs === 0n;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cash Flow Statement
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {entity.name} · {isoStart} to {isoEnd} · Indirect method
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/books`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Books
          </Link>
          <Link
            href={`/${params.tenant}/books/reports/pnl${searchParams.entity ? `?entity=${searchParams.entity}` : ""}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            P&L
          </Link>
          <Link
            href={`/${params.tenant}/books/reports/balance-sheet${searchParams.entity ? `?entity=${searchParams.entity}` : ""}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Balance Sheet
          </Link>
        </div>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
            Start
          </label>
          <input
            type="date"
            name="start"
            defaultValue={isoStart}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
            End
          </label>
          <input
            type="date"
            name="end"
            defaultValue={isoEnd}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Run report
        </button>
      </form>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Opening cash" value={formatCents(report.openingCashCents)} />
        <Stat
          label="Net change"
          value={formatCents(report.netCashChangeCents)}
          highlight={report.netCashChangeCents >= 0n ? "positive" : "negative"}
        />
        <Stat
          label="Closing cash"
          value={formatCents(report.closingCashCents)}
          sub={`${report.cashAccountIds.length} cash account${report.cashAccountIds.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Net income"
          value={formatCents(report.netIncomeCents)}
          highlight={report.netIncomeCents >= 0n ? "positive" : "negative"}
        />
      </div>

      {/* Reconciliation banner */}
      <div
        className={`mt-4 rounded-md border p-3 text-sm ${
          isBalanced
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {isBalanced ? (
          <>
            <span className="font-semibold">Reconciled ✓</span> — indirect method total
            ({formatCents(report.netCashChangeCents)}) matches direct trace through cash
            accounts.
          </>
        ) : (
          <>
            <span className="font-semibold">Drift {formatCents(report.reconciliationDriftCents)}</span>{" "}
            between indirect total ({formatCents(report.netCashChangeCents)}) and direct
            cash-account trace ({formatCents(report.directTraceCents)}). This usually means
            an account is mis-classified or a JE bypasses the standard pattern — review the
            account drill-downs below.
          </>
        )}
      </div>

      {/* Indirect method statement */}
      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Account / Line</th>
              <th className="px-4 py-2 text-right font-medium">Cash effect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* OPERATING */}
            <tr className="bg-slate-100">
              <td
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700"
                colSpan={3}
              >
                Operating activities
              </td>
            </tr>
            <tr className="hover:bg-blue-50">
              <td className="px-4 py-1.5 font-mono text-xs text-slate-400">—</td>
              <td className="px-4 py-1.5 text-slate-900">Net income</td>
              <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">
                {formatCents(report.netIncomeCents)}
              </td>
            </tr>
            <Subsection
              tenantSlug={params.tenant}
              isoStart={isoStart}
              isoEnd={isoEnd}
              heading="Non-cash adjustments"
              rows={report.nonCashAdjustments.rows}
              total={report.nonCashAdjustments.total}
            />
            <Subsection
              tenantSlug={params.tenant}
              isoStart={isoStart}
              isoEnd={isoEnd}
              heading="Changes in working capital"
              rows={report.workingCapital.rows}
              total={report.workingCapital.total}
            />
            <tr className="bg-blue-50">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-sm font-bold text-slate-900">
                Cash from operating activities
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                {formatCents(report.operating.total)}
              </td>
            </tr>

            {/* INVESTING */}
            <tr className="bg-slate-100">
              <td
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700"
                colSpan={3}
              >
                Investing activities
              </td>
            </tr>
            {report.investing.rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-1.5 italic text-slate-400">
                  No investing activity in this period.
                </td>
              </tr>
            ) : (
              report.investing.rows.map((r) => (
                <AccountRow
                  key={r.accountId}
                  row={r}
                  tenantSlug={params.tenant}
                  isoStart={isoStart}
                  isoEnd={isoEnd}
                />
              ))
            )}
            <tr className="bg-blue-50">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-sm font-bold text-slate-900">
                Cash from investing activities
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                {formatCents(report.investing.total)}
              </td>
            </tr>

            {/* FINANCING */}
            <tr className="bg-slate-100">
              <td
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700"
                colSpan={3}
              >
                Financing activities
              </td>
            </tr>
            {report.financing.rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-1.5 italic text-slate-400">
                  No financing activity in this period.
                </td>
              </tr>
            ) : (
              report.financing.rows.map((r) => (
                <AccountRow
                  key={r.accountId}
                  row={r}
                  tenantSlug={params.tenant}
                  isoStart={isoStart}
                  isoEnd={isoEnd}
                />
              ))
            )}
            <tr className="bg-blue-50">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-sm font-bold text-slate-900">
                Cash from financing activities
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                {formatCents(report.financing.total)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white">
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-sm font-bold">Net change in cash</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-base font-bold">
                {formatCents(report.netCashChangeCents)}
              </td>
            </tr>
            <tr className="bg-slate-50">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-xs text-slate-500">
                Opening cash {formatCents(report.openingCashCents)} + net change ={" "}
                <span className="font-semibold text-slate-700">
                  closing cash {formatCents(report.closingCashCents)}
                </span>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Subsection({
  tenantSlug,
  isoStart,
  isoEnd,
  heading,
  rows,
  total,
}: {
  tenantSlug: string;
  isoStart: string;
  isoEnd: string;
  heading: string;
  rows: CashFlowRow[];
  total: bigint;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <tr className="bg-slate-50">
        <td
          className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500"
          colSpan={3}
        >
          {heading}
        </td>
      </tr>
      {rows.map((r) => (
        <AccountRow
          key={r.accountId}
          row={r}
          tenantSlug={tenantSlug}
          isoStart={isoStart}
          isoEnd={isoEnd}
        />
      ))}
      <tr className="border-t border-slate-200">
        <td className="px-4 py-1.5" />
        <td className="px-4 py-1.5 text-sm font-medium text-slate-600">Total {heading.toLowerCase()}</td>
        <td className="px-4 py-1.5 text-right font-mono tabular-nums text-sm font-medium text-slate-700">
          {formatCents(total)}
        </td>
      </tr>
    </>
  );
}

function AccountRow({
  row,
  tenantSlug,
  isoStart,
  isoEnd,
}: {
  row: CashFlowRow;
  tenantSlug: string;
  isoStart: string;
  isoEnd: string;
}) {
  const drillHref = `/${tenantSlug}/books/accounts/${row.accountId}?start=${isoStart}&end=${isoEnd}`;
  return (
    <tr className="hover:bg-blue-50">
      <td className="px-4 py-1.5 font-mono text-xs text-slate-500">
        <Link href={drillHref} className="hover:text-blue-700 hover:underline">
          {row.code}
        </Link>
      </td>
      <td className="px-4 py-1.5 text-slate-900">
        <Link href={drillHref} className="hover:text-blue-700 hover:underline">
          {row.name}
        </Link>
        {row.balanceChangeCents !== 0n && (
          <span className="ml-2 text-xs text-slate-400">
            (Δ {formatCents(row.balanceChangeCents)})
          </span>
        )}
      </td>
      <td
        className={`px-4 py-1.5 text-right font-mono tabular-nums ${
          row.cashEffectCents > 0n
            ? "text-emerald-700"
            : row.cashEffectCents < 0n
            ? "text-slate-900"
            : "text-slate-400"
        }`}
      >
        {formatCents(row.cashEffectCents)}
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "positive" | "negative";
}) {
  const color =
    highlight === "positive"
      ? "text-green-700"
      : highlight === "negative"
      ? "text-red-700"
      : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
