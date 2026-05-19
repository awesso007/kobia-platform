import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, normalBalanceSign } from "@/lib/accounting/ledger";

/**
 * General Ledger view for a single account.
 * Lists every journal line that hit this account in chronological order,
 * with a running balance column.
 *
 * Date range optional via ?start=YYYY-MM-DD&end=YYYY-MM-DD.
 * Defaults to year-to-date.
 */
export default async function AccountLedgerPage({
  params,
  searchParams,
}: {
  params: { tenant: string; accountId: string };
  searchParams: { start?: string; end?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const account = await db.account.findFirst({
    where: { id: params.accountId, tenantId: auth.tenant.id },
    include: { entity: { select: { id: true, name: true } } },
  });
  if (!account) notFound();

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), 0, 1);
  const startDate = searchParams.start ? new Date(searchParams.start) : defaultStart;
  const endDate = searchParams.end ? new Date(searchParams.end) : now;

  // Pull all lines that hit this account in the range, with their JE header.
  const lines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      tenantId: auth.tenant.id,
      journalEntry: {
        status: { in: ["POSTED", "REVERSED"] },
        entryDate: { gte: startDate, lte: endDate },
      },
    },
    include: {
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
          description: true,
          status: true,
          source: true,
        },
      },
    },
    orderBy: [
      { journalEntry: { entryDate: "asc" } },
      { journalEntry: { entryNumber: "asc" } },
      { lineNumber: "asc" },
    ],
  });

  // Opening balance: sum of all lines BEFORE startDate (debit-positive net), then
  // sign-adjust to the account's normal-balance convention.
  const priorAgg = await db.journalLine.aggregate({
    where: {
      accountId: account.id,
      tenantId: auth.tenant.id,
      journalEntry: {
        status: { in: ["POSTED", "REVERSED"] },
        entryDate: { lt: startDate },
      },
    },
    _sum: { debitCents: true, creditCents: true },
  });
  const priorDebit = priorAgg._sum.debitCents ?? 0n;
  const priorCredit = priorAgg._sum.creditCents ?? 0n;
  const sign = BigInt(normalBalanceSign(account.type));
  // Net debit before period, signed to normal balance
  const openingBalance = (priorDebit - priorCredit) * sign;

  // Build rows with running balance (normal-balance signed)
  let running = openingBalance;
  const rows = lines.map((l) => {
    const netDebit = l.debitCents - l.creditCents;
    const delta = netDebit * sign;
    running += delta;
    return {
      lineId: l.id,
      entryId: l.journalEntry.id,
      entryNumber: l.journalEntry.entryNumber,
      entryDate: l.journalEntry.entryDate,
      description: l.journalEntry.description,
      memo: l.memo,
      status: l.journalEntry.status,
      source: l.journalEntry.source,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      balance: running,
    };
  });

  const totalDebit = rows.reduce((s, r) => s + r.debitCents, 0n);
  const totalCredit = rows.reduce((s, r) => s + r.creditCents, 0n);
  const closingBalance = running;

  const isoStart = startDate.toISOString().slice(0, 10);
  const isoEnd = endDate.toISOString().slice(0, 10);

  const accountTypeLabel = account.type.replace(/_/g, " ");
  const isDebitNormal = sign === 1n;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
              Books
            </Link>
            <span>›</span>
            <span>General Ledger</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            <span className="font-mono text-slate-500">{account.code}</span>{" "}
            <span>{account.name}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {account.entity.name} ·{" "}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {accountTypeLabel}
            </span>{" "}
            ·{" "}
            <span className="text-xs text-slate-500">
              Normal balance: {isDebitNormal ? "Debit" : "Credit"}
            </span>
          </p>
        </div>
        <Link
          href={`/${params.tenant}/books`}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Trial Balance
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Start</label>
          <input
            type="date"
            name="start"
            defaultValue={isoStart}
            className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">End</label>
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
          Refresh
        </button>
      </form>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Opening Balance" value={formatCents(openingBalance)} sub={`as of ${isoStart}`} />
        <Stat label="Total Debits" value={formatCents(totalDebit)} />
        <Stat label="Total Credits" value={formatCents(totalCredit)} />
        <Stat label="Closing Balance" value={formatCents(closingBalance)} sub={`as of ${isoEnd}`} highlight />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">JE #</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">Debit</th>
              <th className="px-4 py-2 text-right font-medium">Credit</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-slate-50/50">
              <td className="px-4 py-2 text-xs text-slate-500" colSpan={3}>
                Opening balance
              </td>
              <td className="px-4 py-2 text-right font-mono text-xs text-slate-400">—</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-slate-400">—</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-slate-700">
                {formatCents(openingBalance)}
              </td>
            </tr>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No activity in this date range.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.lineId}
                className={`hover:bg-slate-50 ${r.status === "REVERSED" ? "bg-amber-50/40" : ""}`}
              >
                <td className="px-4 py-1.5 font-mono text-xs text-slate-500">
                  {r.entryDate.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-1.5 font-mono text-xs text-slate-500">#{r.entryNumber}</td>
                <td className="px-4 py-1.5 text-slate-900">
                  {r.description}
                  {r.memo && <span className="ml-2 text-xs text-slate-500">— {r.memo}</span>}
                  {r.status === "REVERSED" && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      REVERSED
                    </span>
                  )}
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">{r.source}</span>
                </td>
                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">
                  {r.debitCents > 0n ? formatCents(r.debitCents) : ""}
                </td>
                <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">
                  {r.creditCents > 0n ? formatCents(r.creditCents) : ""}
                </td>
                <td className="px-4 py-1.5 text-right font-mono tabular-nums font-medium text-slate-900">
                  {formatCents(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr>
              <td className="px-4 py-2" colSpan={3}>
                Period totals
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{formatCents(totalDebit)}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{formatCents(totalCredit)}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{formatCents(closingBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {rows.length} line{rows.length === 1 ? "" : "s"} · Reversed entries are highlighted but kept in the
        running balance because their reversing entry already offsets them.
      </p>
    </div>
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
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border ${
        highlight ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
      } p-4 shadow-sm`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
