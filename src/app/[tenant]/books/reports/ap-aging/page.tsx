import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { apAgeBucket } from "@/lib/accounting/ap";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

export default async function ApAgingPage({
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

  const bills = await db.bill.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      status: { in: ["OPEN", "PARTIAL"] },
    },
    include: {
      vendor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  type Buckets = {
    current: bigint;
    d1_30: bigint;
    d31_60: bigint;
    d61_90: bigint;
    over90: bigint;
    total: bigint;
  };
  const zeroBuckets = (): Buckets => ({
    current: 0n,
    d1_30: 0n,
    d31_60: 0n,
    d61_90: 0n,
    over90: 0n,
    total: 0n,
  });

  const byVendor = new Map<
    string,
    { vendorId: string; vendorName: string; email: string | null; buckets: Buckets; bills: typeof bills }
  >();

  for (const b of bills) {
    const bucket = apAgeBucket(b.dueDate, asOf);
    const existing = byVendor.get(b.vendorId) ?? {
      vendorId: b.vendorId,
      vendorName: b.vendor.name,
      email: b.vendor.email,
      buckets: zeroBuckets(),
      bills: [] as typeof bills,
    };
    const bk = existing.buckets;
    const amt = b.balanceCents;
    if (bucket === "CURRENT") bk.current += amt;
    else if (bucket === "DAYS_1_30") bk.d1_30 += amt;
    else if (bucket === "DAYS_31_60") bk.d31_60 += amt;
    else if (bucket === "DAYS_61_90") bk.d61_90 += amt;
    else bk.over90 += amt;
    bk.total += amt;
    existing.bills.push(b);
    byVendor.set(b.vendorId, existing);
  }

  const vendors = Array.from(byVendor.values()).sort((a, b) =>
    a.buckets.total > b.buckets.total ? -1 : 1
  );

  const grand = zeroBuckets();
  for (const v of vendors) {
    grand.current += v.buckets.current;
    grand.d1_30 += v.buckets.d1_30;
    grand.d31_60 += v.buckets.d31_60;
    grand.d61_90 += v.buckets.d61_90;
    grand.over90 += v.buckets.over90;
    grand.total += v.buckets.total;
  }

  const asOfStr = asOf.toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts Payable Aging</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {vendors.length} vendor
            {vendors.length === 1 ? "" : "s"} · {bills.length} open bill
            {bills.length === 1 ? "" : "s"}
          </p>
        </div>
        <form className="flex items-end gap-3" action="">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-700">As of</span>
            <input
              type="date"
              name="asOf"
              defaultValue={asOfStr}
              className="rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Update
          </button>
        </form>
      </div>

      {bills.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No open bills.</p>
          <p className="mt-2 text-xs text-slate-400">
            Create vendors and post bills to see aging here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current</th>
                  <th className="px-4 py-2.5 text-right font-medium">1–30</th>
                  <th className="px-4 py-2.5 text-right font-medium">31–60</th>
                  <th className="px-4 py-2.5 text-right font-medium">61–90</th>
                  <th className="px-4 py-2.5 text-right font-medium">90+</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v.vendorId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-sm">
                      <div className="font-medium text-slate-900">{v.vendorName}</div>
                      {v.email && <div className="text-xs text-slate-500">{v.email}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {v.buckets.current > 0n ? formatCents(v.buckets.current) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {v.buckets.d1_30 > 0n ? formatCents(v.buckets.d1_30) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {v.buckets.d31_60 > 0n ? formatCents(v.buckets.d31_60) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-slate-900">
                      {v.buckets.d61_90 > 0n ? formatCents(v.buckets.d61_90) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums text-rose-700">
                      {v.buckets.over90 > 0n ? formatCents(v.buckets.over90) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {formatCents(v.buckets.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="text-sm font-semibold">
                  <td className="px-4 py-3 text-left text-xs uppercase tracking-wide text-slate-500">
                    Grand total
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.current)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.d1_30)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.d31_60)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.d61_90)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-700">
                    {formatCents(grand.over90)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(grand.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Open bills
              </h2>
            </div>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 text-left font-medium">Bill #</th>
                  <th className="px-4 py-2 text-left font-medium">Vendor</th>
                  <th className="px-4 py-2 text-left font-medium">Billed</th>
                  <th className="px-4 py-2 text-left font-medium">Due</th>
                  <th className="px-4 py-2 text-right font-medium">Days past</th>
                  <th className="px-4 py-2 text-left font-medium">Bucket</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {bills.map((b) => {
                  const days = Math.max(
                    0,
                    Math.floor((asOf.getTime() - b.dueDate.getTime()) / 86400_000)
                  );
                  const bucket = apAgeBucket(b.dueDate, asOf);
                  const bucketLabel = {
                    CURRENT: "Current",
                    DAYS_1_30: "1–30",
                    DAYS_31_60: "31–60",
                    DAYS_61_90: "61–90",
                    DAYS_OVER_90: "90+",
                  }[bucket];
                  const isOver90 = bucket === "DAYS_OVER_90";
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        <Link
                          href={`/${params.tenant}/ap/bills/${b.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          #{b.billNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-900">{b.vendor.name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {b.billDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {b.dueDate.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">
                        {days}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isOver90
                              ? "bg-rose-100 text-rose-800"
                              : bucket === "CURRENT"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {bucketLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                        {formatCents(b.balanceCents)}
                        {b.balanceCents !== b.totalCents && (
                          <span className="ml-1 text-xs text-slate-400">
                            of {formatCents(b.totalCents)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Aging buckets are computed against each bill&apos;s due date. As-of date: {asOfStr}.
      </p>
    </div>
  );
}
