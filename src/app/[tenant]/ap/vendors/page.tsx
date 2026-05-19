import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

export default async function VendorsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const vendors = await db.vendor.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    include: {
      _count: { select: { bills: true } },
      bills: {
        where: { status: { in: ["OPEN", "PARTIAL"] } },
        select: { balanceCents: true },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const rows = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    defaultTermsDays: v.defaultTermsDays,
    is1099: v.is1099Vendor,
    isActive: v.isActive,
    billCount: v._count.bills,
    openBalance: v.bills.reduce((s, b) => s + b.balanceCents, 0n),
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
          <h1 className="text-2xl font-bold text-slate-900">Vendors</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {rows.length} vendor{rows.length === 1 ? "" : "s"} · Total owed{" "}
            <span className="font-medium text-slate-900">{formatCents(grandOpen)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/books/reports/ap-aging`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            AP Aging
          </Link>
          <Link
            href={`/${params.tenant}/ap/bills/new`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            New Bill
          </Link>
          <Link
            href={`/${params.tenant}/ap/vendors/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Vendor
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No vendors yet.</p>
          <p className="mt-2 text-xs text-slate-400">
            Add your first vendor to start tracking bills.
          </p>
          <Link
            href={`/${params.tenant}/ap/vendors/new`}
            className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Vendor
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-left font-medium">Contact</th>
                <th className="px-4 py-2.5 text-right font-medium">Terms</th>
                <th className="px-4 py-2.5 text-right font-medium">Bills</th>
                <th className="px-4 py-2.5 text-right font-medium">Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {rows.map((r) => {
                const href = `/${params.tenant}/ap/vendors/${r.id}`;
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-blue-50 ${r.isActive ? "" : "opacity-60"}`}
                  >
                    <td className="px-4 py-2.5">
                      <Link href={href} className="block">
                        <span className="font-medium text-slate-900">{r.name}</span>
                        {r.is1099 && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">
                            1099
                          </span>
                        )}
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
                        {r.billCount}
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
                  Total owed
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
