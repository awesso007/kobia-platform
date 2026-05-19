import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { apAgeBucket } from "@/lib/accounting/ap";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-800 ring-slate-600/20",
  OPEN: "bg-blue-100 text-blue-800 ring-blue-600/20",
  PARTIAL: "bg-amber-100 text-amber-800 ring-amber-600/20",
  PAID: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  VOID: "bg-rose-100 text-rose-800 ring-rose-600/20",
};

const BUCKET_LABEL: Record<string, string> = {
  CURRENT: "Current",
  DAYS_1_30: "1–30",
  DAYS_31_60: "31–60",
  DAYS_61_90: "61–90",
  DAYS_OVER_90: "90+",
};

export default async function VendorDetailPage({
  params,
}: {
  params: { tenant: string; vendorId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const vendor = await db.vendor.findFirst({
    where: {
      id: params.vendorId,
      tenantId: auth.tenant.id,
      entityId: entity.id,
    },
    include: {
      bills: {
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      },
    },
  });

  if (!vendor) notFound();

  const now = new Date();
  const openBills = vendor.bills.filter((b) => ["OPEN", "PARTIAL"].includes(b.status));
  const openBalance = openBills.reduce((s, b) => s + b.balanceCents, 0n);
  const lifetimeBilled = vendor.bills
    .filter((b) => ["OPEN", "PARTIAL", "PAID"].includes(b.status))
    .reduce((s, b) => s + b.totalCents, 0n);
  const lifetimePaid = vendor.bills.reduce((s, b) => s + b.paidCents, 0n);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ap/vendors`} className="hover:text-slate-700">
          ← All vendors
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{vendor.name}</h1>
            {vendor.is1099Vendor && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-800">
                1099-NEC
              </span>
            )}
            {vendor.is1099MiscVendor && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs uppercase tracking-wide text-purple-800">
                1099-MISC
              </span>
            )}
            {!vendor.isActive && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
                Inactive
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Net {vendor.defaultTermsDays} payment terms · {vendor.bills.length} total bill
            {vendor.bills.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href={`/${params.tenant}/ap/bills/new?vendorId=${vendor.id}`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New bill for this vendor
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Owed</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {formatCents(openBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {openBills.length} open bill{openBills.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lifetime billed</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {formatCents(lifetimeBilled)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Excludes drafts and voids</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lifetime paid</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
            {formatCents(lifetimePaid)}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-1 text-slate-900">{vendor.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt>
            <dd className="mt-1 text-slate-900">{vendor.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Tax ID</dt>
            <dd className="mt-1 font-mono text-slate-900">{vendor.taxId ?? "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Remit-to</dt>
            <dd className="mt-1 whitespace-pre-line text-slate-900">
              {vendor.remitToAddress ?? "—"}
            </dd>
          </div>
          {vendor.notes && (
            <div className="md:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</dt>
              <dd className="mt-1 whitespace-pre-line text-slate-900">{vendor.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Bills</h2>
        </div>
        {vendor.bills.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No bills yet.{" "}
            <Link
              href={`/${params.tenant}/ap/bills/new?vendorId=${vendor.id}`}
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Enter the first one →
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Bill #</th>
                <th className="px-4 py-2 text-left font-medium">Vendor ref</th>
                <th className="px-4 py-2 text-left font-medium">Bill date</th>
                <th className="px-4 py-2 text-left font-medium">Due</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {vendor.bills.map((b) => {
                const href = `/${params.tenant}/ap/bills/${b.id}`;
                const isOpen = ["OPEN", "PARTIAL"].includes(b.status);
                const daysPast = isOpen
                  ? Math.max(0, Math.floor((now.getTime() - b.dueDate.getTime()) / 86400_000))
                  : 0;
                const bucket = isOpen ? apAgeBucket(b.dueDate, now) : null;
                return (
                  <tr key={b.id} className="hover:bg-blue-50">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={href} className="text-indigo-600 hover:text-indigo-700">
                        {b.billNumber > 0 ? `#${b.billNumber}` : (
                          <span className="text-slate-400">draft</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {b.vendorBillNumber ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {b.billDate.toISOString().slice(0, 10)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {b.dueDate.toISOString().slice(0, 10)}
                        {bucket && bucket !== "CURRENT" && (
                          <span className="ml-2 text-rose-600">({daysPast}d late)</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={href} className="block">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                            STATUS_BADGES[b.status] ?? STATUS_BADGES.DRAFT
                          }`}
                        >
                          {b.status}
                        </span>
                        {bucket && bucket !== "CURRENT" && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-rose-600">
                            {BUCKET_LABEL[bucket]}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                      <Link href={href} className="block">
                        {formatCents(b.totalCents)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700">
                      <Link href={href} className="block">
                        {b.paidCents > 0n ? formatCents(b.paidCents) : ""}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                      <Link href={href} className="block">
                        {b.balanceCents > 0n ? formatCents(b.balanceCents) : ""}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
