import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, normalBalanceSign } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";
import { buildTrialBalance } from "@/lib/accounting/trial-balance";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

/**
 * CPA Close Package — single printable page that combines:
 *   1. Cover sheet (entity + as-of date + signatures)
 *   2. Trial Balance
 *   3. Balance Sheet (summary by type)
 *   4. P&L (summary by type)
 *   5. Recent posted journal entries (period detail)
 *
 * Designed for the browser Print → Save as PDF flow.
 */
export default async function ClosePackagePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { asOf?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const asOfStr = searchParams.asOf ?? new Date().toISOString().slice(0, 10);
  const asOfDate = new Date(asOfStr + "T23:59:59.000Z");
  const startOfYear = new Date(Date.UTC(asOfDate.getUTCFullYear(), 0, 1));

  // 1. Trial Balance
  const tb = await buildTrialBalance({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    asOfDate,
  });

  // 2. Balance Sheet from cached balances
  const accounts = await db.account.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });
  const assets = accounts.filter((a) => a.type === "ASSET" && a.balanceCents !== 0n);
  const liabilities = accounts.filter((a) => a.type === "LIABILITY" && a.balanceCents !== 0n);
  const equity = accounts.filter((a) => a.type === "EQUITY" && a.balanceCents !== 0n);
  const totalAssets = assets.reduce((s, a) => s + a.balanceCents, 0n);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balanceCents, 0n);
  const totalEquityBooked = equity.reduce((s, a) => s + a.balanceCents, 0n);

  // Retained earnings = sum of revenue - expense (ytd-style across all time)
  let retainedEarnings = 0n;
  for (const acc of accounts) {
    const sign = BigInt(normalBalanceSign(acc.type));
    if (acc.type === "REVENUE" || acc.type === "OTHER_INCOME") {
      retainedEarnings += acc.balanceCents * sign;
    } else if (
      acc.type === "EXPENSE" ||
      acc.type === "COGS" ||
      acc.type === "OTHER_EXPENSE"
    ) {
      retainedEarnings -= acc.balanceCents * sign;
    }
  }
  const totalEquity = totalEquityBooked + retainedEarnings;

  // 3. P&L (YTD) from posted JEs
  const ytdLines = await db.journalLine.findMany({
    where: {
      tenantId: auth.tenant.id,
      journalEntry: {
        entityId: entity.id,
        status: "POSTED",
        entryDate: { gte: startOfYear, lte: asOfDate },
      },
    },
    select: {
      accountId: true,
      debitCents: true,
      creditCents: true,
    },
  });
  const pnlByAccount = new Map<string, bigint>();
  for (const l of ytdLines) {
    pnlByAccount.set(
      l.accountId,
      (pnlByAccount.get(l.accountId) ?? 0n) + l.debitCents - l.creditCents
    );
  }
  type PnlRow = { code: string; name: string; type: string; amount: bigint };
  const revenueRows: PnlRow[] = [];
  const cogsRows: PnlRow[] = [];
  const expenseRows: PnlRow[] = [];
  for (const acc of accounts) {
    const raw = pnlByAccount.get(acc.id);
    if (!raw || raw === 0n) continue;
    const sign = BigInt(normalBalanceSign(acc.type));
    const natural = raw * sign;
    if (acc.type === "REVENUE" || acc.type === "OTHER_INCOME") {
      revenueRows.push({ code: acc.code, name: acc.name, type: acc.type, amount: natural });
    } else if (acc.type === "COGS") {
      cogsRows.push({ code: acc.code, name: acc.name, type: acc.type, amount: natural });
    } else if (acc.type === "EXPENSE" || acc.type === "OTHER_EXPENSE") {
      expenseRows.push({ code: acc.code, name: acc.name, type: acc.type, amount: natural });
    }
  }
  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0n);
  const totalCogs = cogsRows.reduce((s, r) => s + r.amount, 0n);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0n);
  const grossProfit = totalRevenue - totalCogs;
  const netIncome = grossProfit - totalExpense;

  // 4. Recent journal entries (last 50 posted)
  const recentJEs = await db.journalEntry.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      status: "POSTED",
      entryDate: { lte: asOfDate },
    },
    include: {
      lines: { select: { debitCents: true } },
    },
    orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
    take: 50,
  });

  return (
    <div className="bg-slate-100 print:bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page { page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          body { background: white; }
        }
        @page { size: letter; margin: 0.5in; }
      `}</style>

      <div className="no-print mx-auto max-w-5xl px-6 pt-6 pb-2 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
            ← Back to books
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <form method="GET" className="flex items-end gap-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">As of</span>
              <input
                type="date"
                name="asOf"
                defaultValue={asOfStr}
                className="mt-1 block rounded-md border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Update
            </button>
          </form>
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-5xl bg-white p-10 shadow print:shadow-none">
        {/* Cover */}
        <div className="page">
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest text-slate-500">
              KOBIA Accounting
            </div>
            <h1 className="mt-4 text-4xl font-bold text-slate-900">
              Close Package
            </h1>
            <div className="mt-4 text-lg text-slate-700">{entity.name}</div>
            <div className="text-sm text-slate-500">
              As of {asOfDate.toISOString().slice(0, 10)} · Base currency{" "}
              {entity.baseCurrency}
            </div>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Card label="Total assets" cents={totalAssets} />
            <Card label="Total liabilities + equity" cents={totalLiabilities + totalEquity} />
            <Card label="YTD revenue" cents={totalRevenue} />
            <Card label="YTD net income" cents={netIncome} tone={netIncome >= 0n ? "emerald" : "rose"} />
          </div>

          <div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-600">
            <div className="grid grid-cols-2 gap-12">
              <div>
                <div className="font-semibold text-slate-900">Prepared by</div>
                <div className="mt-8 border-b border-slate-300 pb-1"></div>
                <div className="mt-1 text-xs text-slate-500">Signature / Date</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Reviewed by</div>
                <div className="mt-8 border-b border-slate-300 pb-1"></div>
                <div className="mt-1 text-xs text-slate-500">Signature / Date</div>
              </div>
            </div>
          </div>
        </div>

        {/* Trial Balance */}
        <div className="page mt-12">
          <h2 className="text-2xl font-bold text-slate-900">Trial Balance</h2>
          <p className="mt-1 text-sm text-slate-600">
            As of {asOfDate.toISOString().slice(0, 10)} · {tb.balanced ? "Balanced ✓" : `Out of balance by ${formatCents(tb.difference)}`}
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2">Code</th>
                <th className="py-1 pr-2">Account</th>
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2 text-right">Debit</th>
                <th className="py-1 pr-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.accountId} className="border-b border-slate-100">
                  <td className="py-1 pr-2 font-mono text-slate-500">{r.code}</td>
                  <td className="py-1 pr-2 text-slate-800">{r.name}</td>
                  <td className="py-1 pr-2 text-xs uppercase text-slate-500">{r.type}</td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">
                    {r.debitCents > 0n ? formatCents(r.debitCents) : ""}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">
                    {r.creditCents > 0n ? formatCents(r.creditCents) : ""}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-400 font-semibold text-slate-900">
                <td colSpan={3} className="py-1.5 pr-2">Totals</td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{formatCents(tb.totalDebits)}</td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{formatCents(tb.totalCredits)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Balance Sheet */}
        <div className="page mt-12">
          <h2 className="text-2xl font-bold text-slate-900">Balance Sheet</h2>
          <p className="mt-1 text-sm text-slate-600">
            As of {asOfDate.toISOString().slice(0, 10)}
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <BsSection title="Assets" rows={assets.map((a) => ({ code: a.code, name: a.name, amount: a.balanceCents }))} total={totalAssets} />
            <div>
              <BsSection title="Liabilities" rows={liabilities.map((a) => ({ code: a.code, name: a.name, amount: a.balanceCents }))} total={totalLiabilities} />
              <div className="mt-6">
                <BsSection
                  title="Equity"
                  rows={[
                    ...equity.map((a) => ({ code: a.code, name: a.name, amount: a.balanceCents })),
                    { code: "—", name: "Retained earnings (all-time)", amount: retainedEarnings },
                  ]}
                  total={totalEquity}
                />
              </div>
              <div className="mt-4 flex items-center justify-between border-t-2 border-slate-400 pt-2 text-sm font-semibold">
                <span>Total liabilities + equity</span>
                <span className="font-mono tabular-nums">{formatCents(totalLiabilities + totalEquity)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* P&L */}
        <div className="page mt-12">
          <h2 className="text-2xl font-bold text-slate-900">Profit &amp; Loss (YTD)</h2>
          <p className="mt-1 text-sm text-slate-600">
            {startOfYear.toISOString().slice(0, 10)} through{" "}
            {asOfDate.toISOString().slice(0, 10)}
          </p>
          <table className="mt-4 w-full text-sm">
            <tbody>
              <PnlGroup title="Revenue" rows={revenueRows} total={totalRevenue} />
              <PnlGroup title="Cost of Goods Sold" rows={cogsRows} total={totalCogs} />
              <tr className="border-t border-slate-300 font-semibold text-slate-900">
                <td className="py-1.5 pr-2">Gross profit</td>
                <td></td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{formatCents(grossProfit)}</td>
              </tr>
              <PnlGroup title="Operating Expenses" rows={expenseRows} total={totalExpense} />
              <tr className="border-t-2 border-slate-400 font-semibold text-slate-900">
                <td className="py-2 pr-2 text-base">Net income</td>
                <td></td>
                <td className={`py-2 pr-2 text-right font-mono tabular-nums text-base ${netIncome >= 0n ? "text-emerald-700" : "text-rose-700"}`}>
                  {formatCents(netIncome)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Recent JEs */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-slate-900">Recent Journal Entries</h2>
          <p className="mt-1 text-sm text-slate-600">
            Latest 50 posted entries through {asOfDate.toISOString().slice(0, 10)}
          </p>
          <table className="mt-4 w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-left uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">JE#</th>
                <th className="py-1 pr-2">Source</th>
                <th className="py-1 pr-2">Description</th>
                <th className="py-1 pr-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentJEs.map((e) => {
                const total = e.lines.reduce((s, l) => s + l.debitCents, 0n);
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-1 pr-2 text-slate-700 whitespace-nowrap">
                      {e.entryDate.toISOString().slice(0, 10)}
                    </td>
                    <td className="py-1 pr-2 font-mono text-slate-700">#{e.entryNumber}</td>
                    <td className="py-1 pr-2 text-slate-700">{e.source}</td>
                    <td className="py-1 pr-2 text-slate-700">{e.description ?? ""}</td>
                    <td className="py-1 pr-2 text-right font-mono tabular-nums text-slate-900">
                      {formatCents(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Generated by KOBIA Accounting · {new Date().toISOString().slice(0, 10)}
        </div>
      </div>
    </div>
  );
}

function Card({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: bigint;
  tone?: "emerald" | "rose";
}) {
  const toneClass = tone
    ? { emerald: "border-emerald-200 bg-emerald-50 text-emerald-900", rose: "border-rose-200 bg-rose-50 text-rose-900" }[tone]
    : "border-slate-200 bg-slate-50 text-slate-900";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold font-mono tabular-nums">{formatCents(cents)}</div>
    </div>
  );
}

function BsSection({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ code: string; name: string; amount: bigint }>;
  total: bigint;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        {title}
      </h3>
      <div className="mt-2 divide-y divide-slate-100">
        {rows.length === 0 ? (
          <div className="py-1 text-sm text-slate-400">None</div>
        ) : (
          rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-sm">
              <span className="text-slate-700">
                <span className="font-mono text-slate-500 mr-2">{r.code}</span>
                {r.name}
              </span>
              <span className="font-mono tabular-nums">{formatCents(r.amount)}</span>
            </div>
          ))
        )}
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-slate-300 pt-1 text-sm font-semibold">
        <span>Total {title.toLowerCase()}</span>
        <span className="font-mono tabular-nums">{formatCents(total)}</span>
      </div>
    </div>
  );
}

function PnlGroup({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ code: string; name: string; amount: bigint }>;
  total: bigint;
}) {
  return (
    <>
      <tr>
        <td colSpan={3} className="pt-3 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
          {title}
        </td>
      </tr>
      {rows.map((r, i) => (
        <tr key={i} className="border-b border-slate-100">
          <td className="py-0.5 pl-4 pr-2 font-mono text-slate-500 text-xs">{r.code}</td>
          <td className="py-0.5 pr-2 text-slate-700">{r.name}</td>
          <td className="py-0.5 pr-2 text-right font-mono tabular-nums">{formatCents(r.amount)}</td>
        </tr>
      ))}
      <tr className="border-b border-slate-300 font-semibold">
        <td></td>
        <td className="py-1 pr-2 text-slate-900">Total {title.toLowerCase()}</td>
        <td className="py-1 pr-2 text-right font-mono tabular-nums">{formatCents(total)}</td>
      </tr>
    </>
  );
}

