import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { listCustomersWithBalance } from "@/lib/accounting/customer-statements";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

export default async function StatementsIndexPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { asOf?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const asOf = searchParams.asOf ? new Date(searchParams.asOf) : new Date();
  const asOfStr = asOf.toISOString().slice(0, 10);

  const rows = await listCustomersWithBalance({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    asOf,
  });

  const withBalance = rows.filter((r) => r.balanceCents > 0n);
  const totalOutstanding = withBalance.reduce((s, r) => s + r.balanceCents, 0n);
  const totalCustomers = withBalance.length;
  const totalInvoices = withBalance.reduce((s, r) => s + r.openInvoiceCount, 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ar/invoices`} className="hover:text-slate-700">
          ← Back to invoicing
        </Link>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Statements</h1>
          <p className="mt-1 text-sm text-slate-500">
            Print or email an account statement to each customer with an open balance.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">As of</span>
            <input
              type="date"
              name="asOf"
              defaultValue={asOfStr}
              className="mt-1 rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Update
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total outstanding</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{formatCents(totalOutstanding)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Customers with balance</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totalCustomers}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Open invoices</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totalInvoices}</div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 text-left font-medium">Customer</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-right font-medium">Open invoices</th>
              <th className="px-4 py-2 text-right font-medium">Oldest overdue</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {withBalance.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No customers with an open balance as of {asOfStr}.
                </td>
              </tr>
            ) : (
              withBalance.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{r.email ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-sm font-mono tabular-nums">{r.openInvoiceCount}</td>
                  <td className="px-4 py-2 text-right text-sm">
                    {r.oldestDaysOverdue > 0 ? (
                      <span className={r.oldestDaysOverdue > 30 ? "font-semibold text-rose-700" : "text-amber-700"}>
                        {r.oldestDaysOverdue}d
                      </span>
                    ) : (
                      <span className="text-emerald-700">Current</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                    {formatCents(r.balanceCents)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/${params.tenant}/ar/statements/${r.id}?asOf=${asOfStr}`}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      View statement →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
