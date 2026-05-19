import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const customers = await db.customer.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    include: {
      _count: { select: { invoices: true } },
      invoices: {
        where: { status: { in: ["OPEN", "PARTIAL"] } },
        select: { balanceCents: true },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const rows = customers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    defaultTermsDays: c.defaultTermsDays,
    isActive: c.isActive,
    invoiceCount: c._count.invoices,
    openBalance: c.invoices.reduce((s, i) => s + i.balanceCents, 0n),
  }));

  const grandOpen = rows.reduce((s, r) => s + r.openBalance, 0n);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {rows.length} customer{rows.length === 1 ? "" : "s"} · Total open balance{" "}
            <span className="font-medium text-slate-900">{formatCents(grandOpen)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/books/reports/ar-aging`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            AR Aging
          </Link>
          <Link
            href={`/${params.tenant}/ar/invoices/new`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            New Invoice
          </Link>
          <Link
            href={`/${params.tenant}/ar/customers/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Customer
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No customers yet.</p>
          <p className="mt-2 text-xs text-slate-400">
            Create your first customer to start invoicing.
          </p>
          <Link
            href={`/${params.tenant}/ar/customers/new`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Customer
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                <th className="px-4 py-2.5 text-left font-medium">Contact</th>
                <th className="px-4 py-2.5 text-right font-medium">Terms</th>
                <th className="px-4 py-2.5 text-right font-medium">Invoices</th>
                <th className="px-4 py-2.5 text-right font-medium">Open balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {rows.map((r) => {
                const href = `/${params.tenant}/ar/customers/${r.id}`;
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-blue-50 ${r.isActive ? "" : "opacity-60"}`}
                  >
                    <td className="px-4 py-2.5">
                      <Link href={href} className="block">
                        <span className="font-medium text-slate-900">{r.name}</span>
                        {!r.isActive && (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                            inactive
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <Link href={href} className="block">
                        {r.email && <span>{r.email}</span>}
                        {r.email && r.phone && <span> · </span>}
                        {r.phone && <span>{r.phone}</span>}
                        {!r.email && !r.phone && <span className="text-slate-400">—</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        Net {r.defaultTermsDays}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {r.invoiceCount}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                      <Link href={href} className="block">
                        {r.openBalance > 0n ? formatCents(r.openBalance) : "—"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr className="text-sm font-semibold">
                <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase tracking-wide text-slate-500">
                  Total open
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                  {formatCents(grandOpen)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
