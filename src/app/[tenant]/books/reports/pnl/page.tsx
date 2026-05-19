import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, normalBalanceSign } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";

/**
 * Profit & Loss report. Server-rendered.
 * Defaults to year-to-date (Jan 1 of current year → today) if no range given.
 * Honors ?start=YYYY-MM-DD&end=YYYY-MM-DD query params.
 */
export default async function PnLReportPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { start?: string; end?: string; entity?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  // Optional ?entity= override (useful for shareable report links).
  // Otherwise use the active entity from the sidebar switcher.
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profit & Loss</h1>
        <p className="mt-2 text-sm text-slate-600">No entities yet.</p>
      </div>
    );
  }

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), 0, 1);
  const startDate = searchParams.start ? new Date(searchParams.start) : defaultStart;
  const endDate = searchParams.end ? new Date(searchParams.end) : now;

  const accounts = await db.account.findMany({
    where: {
      entityId: entity.id,
      tenantId: auth.tenant.id,
      type: { in: ["REVENUE", "OTHER_INCOME", "EXPENSE", "COGS", "OTHER_EXPENSE"] },
    },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    include: {
      journalLines: {
        where: {
          journalEntry: {
            // Include both — see ledger.ts: a reversed entry's lines net to zero
            // with its reversing entry. Excluding only the original double-counts.
            status: { in: ["POSTED", "REVERSED"] },
            entryDate: { gte: startDate, lte: endDate },
          },
        },
        select: { debitCents: true, creditCents: true },
      },
    },
  });

  type Row = { code: string; name: string; amount: bigint };
  const buckets: Record<string, { rows: Row[]; total: bigint; label: string }> = {
    REVENUE: { rows: [], total: 0n, label: "Revenue" },
    OTHER_INCOME: { rows: [], total: 0n, label: "Other Income" },
    COGS: { rows: [], total: 0n, label: "Cost of Goods Sold" },
    EXPENSE: { rows: [], total: 0n, label: "Operating Expenses" },
    OTHER_EXPENSE: { rows: [], total: 0n, label: "Other Expenses" },
  };

  for (const acc of accounts) {
    const sign = BigInt(normalBalanceSign(acc.type));
    let net = 0n;
    for (const l of acc.journalLines) net += l.debitCents - l.creditCents;
    const amount = sign === 1n ? net : -net;
    if (amount === 0n) continue;
    buckets[acc.type]!.rows.push({ code: acc.code, name: acc.name, amount });
    buckets[acc.type]!.total += amount;
  }

  const totalRevenue = buckets.REVENUE!.total + buckets.OTHER_INCOME!.total;
  const totalCOGS = buckets.COGS!.total;
  const grossProfit = totalRevenue - totalCOGS;
  const totalOpex = buckets.EXPENSE!.total;
  const operatingIncome = grossProfit - totalOpex;
  const totalOtherExp = buckets.OTHER_EXPENSE!.total;
  const netIncome = operatingIncome - totalOtherExp;

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const isoStart = fmtDate(startDate);
  const isoEnd = fmtDate(endDate);

  const Section = ({ bucketKey }: { bucketKey: keyof typeof buckets }) => {
    const b = buckets[bucketKey]!;
    if (b.rows.length === 0) return null;
    return (
      <>
        <tr className="bg-slate-50">
          <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600" colSpan={3}>
            {b.label}
          </td>
        </tr>
        {b.rows.map((r) => (
          <tr key={r.code} className="hover:bg-slate-50">
            <td className="px-4 py-1.5 font-mono text-xs text-slate-500">{r.code}</td>
            <td className="px-4 py-1.5 text-slate-900">{r.name}</td>
            <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">
              {formatCents(r.amount)}
            </td>
          </tr>
        ))}
        <tr className="border-t border-slate-200">
          <td className="px-4 py-2" />
          <td className="px-4 py-2 text-sm font-semibold text-slate-700">Total {b.label}</td>
          <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-semibold text-slate-900">
            {formatCents(b.total)}
          </td>
        </tr>
      </>
    );
  };

  const grossMarginPct = totalRevenue > 0n ? Number((grossProfit * 10000n) / totalRevenue) / 100 : null;
  const netMarginPct = totalRevenue > 0n ? Number((netIncome * 10000n) / totalRevenue) / 100 : null;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profit & Loss</h1>
          <p className="mt-1 text-sm text-slate-600">
            {entity.name} · {isoStart} to {isoEnd}
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
            href={`/${params.tenant}/books/reports/balance-sheet${searchParams.entity ? `?entity=${searchParams.entity}` : ""}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Balance Sheet
          </Link>
        </div>
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
          Run report
        </button>
      </form>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Revenue" value={formatCents(totalRevenue)} />
        <Stat
          label="Gross Profit"
          value={formatCents(grossProfit)}
          sub={grossMarginPct !== null ? `${grossMarginPct.toFixed(1)}% margin` : undefined}
        />
        <Stat label="Operating Income" value={formatCents(operatingIncome)} />
        <Stat
          label="Net Income"
          value={formatCents(netIncome)}
          sub={netMarginPct !== null ? `${netMarginPct.toFixed(1)}% margin` : undefined}
          highlight={netIncome >= 0n ? "positive" : "negative"}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <Section bucketKey="REVENUE" />
            <Section bucketKey="OTHER_INCOME" />
            <tr className="bg-blue-50">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-sm font-bold text-slate-900">Total Revenue</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                {formatCents(totalRevenue)}
              </td>
            </tr>
            <Section bucketKey="COGS" />
            {buckets.COGS!.rows.length > 0 && (
              <tr className="bg-blue-50">
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-sm font-bold text-slate-900">Gross Profit</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                  {formatCents(grossProfit)}
                </td>
              </tr>
            )}
            <Section bucketKey="EXPENSE" />
            <tr className="bg-blue-50">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-sm font-bold text-slate-900">Operating Income</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                {formatCents(operatingIncome)}
              </td>
            </tr>
            <Section bucketKey="OTHER_EXPENSE" />
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white">
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-sm font-bold">Net Income</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums text-base font-bold">
                {formatCents(netIncome)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {accounts.every((a) => a.journalLines.length === 0) && (
        <p className="mt-4 text-sm text-slate-500">
          No posted journal entries in this date range.{" "}
          <Link href={`/${params.tenant}/books/journal/new`} className="text-blue-600 hover:underline">
            Post one
          </Link>
          .
        </p>
      )}
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
