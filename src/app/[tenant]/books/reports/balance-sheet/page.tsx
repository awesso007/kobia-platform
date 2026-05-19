import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";

/**
 * Balance Sheet — point-in-time snapshot using cached Account.balanceCents.
 * Retained Earnings = sum of (revenue - expense) since inception.
 */
export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { entity?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Balance Sheet</h1>
        <p className="mt-2 text-sm text-slate-600">No entities yet.</p>
      </div>
    );
  }

  const accounts = await db.account.findMany({
    where: { entityId: entity.id, tenantId: auth.tenant.id },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  type Row = { code: string; name: string; amount: bigint };
  const assets: Row[] = [];
  const liabilities: Row[] = [];
  const equityRows: Row[] = [];
  let retainedEarnings = 0n;

  for (const acc of accounts) {
    const bal = acc.balanceCents;
    if (bal === 0n) continue;
    if (acc.type === "ASSET") {
      assets.push({ code: acc.code, name: acc.name, amount: bal });
    } else if (acc.type === "LIABILITY") {
      liabilities.push({ code: acc.code, name: acc.name, amount: bal });
    } else if (acc.type === "EQUITY") {
      equityRows.push({ code: acc.code, name: acc.name, amount: bal });
    } else if (acc.type === "REVENUE" || acc.type === "OTHER_INCOME") {
      retainedEarnings += bal;
    } else {
      retainedEarnings -= bal;
    }
  }

  const totalAssets = assets.reduce((s, r) => s + r.amount, 0n);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0n);
  const totalBookedEquity = equityRows.reduce((s, r) => s + r.amount, 0n);
  const totalEquity = totalBookedEquity + retainedEarnings;
  const totalLE = totalLiabilities + totalEquity;
  const balanced = totalAssets === totalLE;
  const diff = totalAssets - totalLE;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Balance Sheet</h1>
          <p className="mt-1 text-sm text-slate-600">
            {entity.name} · as of {new Date().toLocaleDateString()}
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
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Assets" rows={assets} total={totalAssets} totalLabel="Total Assets" />
        <div className="space-y-6">
          <Card title="Liabilities" rows={liabilities} total={totalLiabilities} totalLabel="Total Liabilities" />
          <Card
            title="Equity"
            rows={equityRows}
            total={totalBookedEquity}
            totalLabel="Booked Equity"
            extraRow={{ label: "Retained Earnings (Net Income to date)", amount: retainedEarnings }}
            grandTotal={{ label: "Total Equity", amount: totalEquity }}
          />
          <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-white">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">Total Liabilities + Equity</span>
              <span className="font-mono text-lg font-bold tabular-nums">{formatCents(totalLE)}</span>
            </div>
            {balanced ? (
              <p className="mt-2 text-xs text-green-300">✓ Balanced — Assets = Liabilities + Equity</p>
            ) : (
              <p className="mt-2 text-xs text-red-300">
                ⚠ Out of balance by {formatCents(diff)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  rows,
  total,
  totalLabel,
  extraRow,
  grandTotal,
}: {
  title: string;
  rows: Array<{ code: string; name: string; amount: bigint }>;
  total: bigint;
  totalLabel: string;
  extraRow?: { label: string; amount: bigint };
  grandTotal?: { label: string; amount: bigint };
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-4 text-center text-xs text-slate-400">
                No {title.toLowerCase()} recorded.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.code} className="hover:bg-slate-50">
              <td className="px-4 py-1.5 font-mono text-xs text-slate-500">{r.code}</td>
              <td className="px-4 py-1.5 text-slate-900">{r.name}</td>
              <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">
                {formatCents(r.amount)}
              </td>
            </tr>
          ))}
          {extraRow && (
            <tr className="bg-amber-50">
              <td className="px-4 py-1.5" />
              <td className="px-4 py-1.5 text-slate-700">{extraRow.label}</td>
              <td className="px-4 py-1.5 text-right font-mono tabular-nums text-slate-900">
                {formatCents(extraRow.amount)}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="bg-slate-50">
          <tr>
            <td className="px-4 py-2" />
            <td className="px-4 py-2 text-sm font-semibold text-slate-700">{totalLabel}</td>
            <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-semibold text-slate-900">
              {formatCents(total)}
            </td>
          </tr>
          {grandTotal && (
            <tr className="border-t border-slate-200">
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-sm font-bold text-slate-900">{grandTotal.label}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                {formatCents(grandTotal.amount)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
