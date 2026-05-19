import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, normalBalanceSign } from "@/lib/accounting/ledger";

/**
 * Bookkeeping landing page.
 * If the tenant has 0 entities, shows an empty state.
 * If 1+ entities, shows the trial balance for the first one (multi-entity switcher comes Cycle 2 Week 2).
 */
export default async function BooksPage({ params }: { params: { tenant: string } }) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entities = await db.entity.findMany({
    where: { tenantId: auth.tenant.id, isActive: true },
    orderBy: { name: "asc" },
  });

  if (entities.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bookkeeping</h1>
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-lg font-semibold text-slate-900">No books yet</p>
          <p className="mt-2 text-sm text-slate-600">
            Create your first entity to start tracking books.
          </p>
          <p className="mt-6 text-xs text-slate-400">
            Provision script: <code>npm run provision:entity</code>
          </p>
        </div>
      </div>
    );
  }

  const entity = entities[0]!;
  const accounts = await db.account.findMany({
    where: { entityId: entity.id, isActive: true },
    orderBy: { code: "asc" },
  });

  let totalDebit = 0n;
  let totalCredit = 0n;
  const rows = accounts.map((a) => {
    const isDebitNormal = normalBalanceSign(a.type) === 1;
    const bal = a.balanceCents;
    const debit = isDebitNormal ? (bal > 0n ? bal : 0n) : (bal < 0n ? -bal : 0n);
    const credit = isDebitNormal ? (bal < 0n ? -bal : 0n) : (bal > 0n ? bal : 0n);
    totalDebit += debit;
    totalCredit += credit;
    return { ...a, debit, credit };
  });

  const recentEntries = await db.journalEntry.findMany({
    where: { entityId: entity.id },
    orderBy: { entryNumber: "desc" },
    take: 5,
    include: { _count: { select: { lines: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bookkeeping</h1>
          <p className="mt-1 text-sm text-slate-600">
            {entity.name}
            {entity.industry && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{entity.industry}</span>}
            {entity.baseCurrency && <span className="ml-2 text-xs text-slate-500">{entity.baseCurrency}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/books/reports/pnl`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            P&L
          </Link>
          <Link
            href={`/${params.tenant}/books/reports/balance-sheet`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Balance Sheet
          </Link>
          <Link
            href={`/${params.tenant}/books/journal/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Journal Entry
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900">Trial Balance</h2>
            <p className="text-xs text-slate-500">As of {new Date().toLocaleDateString()}</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 text-right font-medium">Debit</th>
                <th className="px-4 py-2 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.filter((r) => r.balanceCents !== 0n).map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.code}</td>
                  <td className="px-4 py-2 text-slate-900">{r.name}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                    {r.debit > 0n ? formatCents(r.debit) : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                    {r.credit > 0n ? formatCents(r.credit) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={2}>Totals</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCents(totalDebit)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCents(totalCredit)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-xs uppercase tracking-wider text-slate-500" colSpan={2}>
                  Status
                </td>
                <td className="px-4 py-2 text-right" colSpan={2}>
                  {totalDebit === totalCredit ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ Balanced
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      ⚠ Out of balance by {formatCents(totalDebit - totalCredit)}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900">Recent Journal Entries</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {recentEntries.length === 0 && (
              <li className="p-4 text-sm text-slate-500">No journal entries yet.</li>
            )}
            {recentEntries.map((e) => (
              <li key={e.id} className="p-4 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs text-slate-500">JE #{e.entryNumber}</span>
                  <span className="text-xs text-slate-400">{new Date(e.entryDate).toLocaleDateString()}</span>
                </div>
                <p className="mt-1 text-slate-900">{e.description}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {e.source} · {e.status} · {e._count.lines} lines
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 text-xs text-slate-400">
        {accounts.length} accounts in chart · entity ID <code className="font-mono">{entity.id}</code>
      </div>
    </div>
  );
}
