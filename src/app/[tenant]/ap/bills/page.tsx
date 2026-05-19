import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma, BillStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-800 ring-slate-600/20",
  PENDING_APPROVAL: "bg-amber-100 text-amber-900 ring-amber-600/20",
  OPEN: "bg-blue-100 text-blue-800 ring-blue-600/20",
  PARTIAL: "bg-amber-100 text-amber-800 ring-amber-600/20",
  PAID: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  VOID: "bg-rose-100 text-rose-800 ring-rose-600/20",
  REJECTED: "bg-rose-100 text-rose-800 ring-rose-600/20",
};

const ALL_STATUSES: BillStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "OPEN",
  "PARTIAL",
  "PAID",
  "VOID",
  "REJECTED",
];

export default async function BillsPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { status?: string; vendorId?: string; from?: string; to?: string; q?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const statusFilter =
    searchParams.status && ALL_STATUSES.includes(searchParams.status as BillStatus)
      ? (searchParams.status as BillStatus)
      : null;
  const vendorIdFilter = searchParams.vendorId?.trim() || null;
  const fromDate = searchParams.from ? new Date(searchParams.from) : null;
  const toDate = searchParams.to ? new Date(searchParams.to) : null;
  const q = searchParams.q?.trim() || null;

  const where: Prisma.BillWhereInput = {
    tenantId: auth.tenant.id,
    entityId: entity.id,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(vendorIdFilter ? { vendorId: vendorIdFilter } : {}),
    ...(fromDate || toDate
      ? {
          billDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { memo: { contains: q, mode: "insensitive" } },
            { vendorBillNumber: { contains: q, mode: "insensitive" } },
            { vendor: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const bills = await db.bill.findMany({
    where,
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { billDate: "desc" }, { billNumber: "desc" }],
    take: 250,
  });

  const vendors = await db.vendor.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const totalBalance = bills.reduce((s, b) => s + b.balanceCents, 0n);
  const totalBilled = bills.reduce((s, b) => s + b.totalCents, 0n);
  const pendingApprovalCount = await db.bill.count({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      status: "PENDING_APPROVAL",
    },
  });
  const now = new Date();

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bills</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {bills.length} match{bills.length === 1 ? "" : "es"} · Total billed{" "}
            <span className="font-medium text-slate-900">{formatCents(totalBilled)}</span> · Owed{" "}
            <span className="font-medium text-slate-900">{formatCents(totalBalance)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/ap/approvals`}
            className="relative rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Approvals
            {pendingApprovalCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                {pendingApprovalCount}
              </span>
            )}
          </Link>
          <Link
            href={`/${params.tenant}/ap/vendors`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Vendors
          </Link>
          <Link
            href={`/${params.tenant}/ap/bills/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Bill
          </Link>
        </div>
      </div>

      <form
        className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5"
        action=""
      >
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-700">Status</span>
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">All</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-700">Vendor</span>
          <select
            name="vendorId"
            defaultValue={vendorIdFilter ?? ""}
            className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">All</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-700">Bill date from</span>
          <input
            type="date"
            name="from"
            defaultValue={searchParams.from ?? ""}
            className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-700">Bill date to</span>
          <input
            type="date"
            name="to"
            defaultValue={searchParams.to ?? ""}
            className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-700">Search memo / vendor</span>
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Free text"
            className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <div className="flex items-end gap-2 md:col-span-5">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Apply filters
          </button>
          <Link
            href={`/${params.tenant}/ap/bills`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </Link>
        </div>
      </form>

      {bills.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No bills match these filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Bill #</th>
                <th className="px-4 py-2 text-left font-medium">Bill date</th>
                <th className="px-4 py-2 text-left font-medium">Vendor</th>
                <th className="px-4 py-2 text-left font-medium">Due</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {bills.map((b) => {
                const href = `/${params.tenant}/ap/bills/${b.id}`;
                const isOpen = ["OPEN", "PARTIAL"].includes(b.status);
                const daysPast = isOpen
                  ? Math.max(0, Math.floor((now.getTime() - b.dueDate.getTime()) / 86400_000))
                  : 0;
                const overdue = isOpen && daysPast > 0;
                return (
                  <tr key={b.id} className={`hover:bg-blue-50 ${overdue ? "bg-rose-50/30" : ""}`}>
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={href} className="text-indigo-600 hover:text-indigo-700">
                        {b.billNumber > 0 ? `#${b.billNumber}` : (
                          <span className="text-slate-400">draft</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {b.billDate.toISOString().slice(0, 10)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-900">
                      <Link href={href} className="block">
                        {b.vendor.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {b.dueDate.toISOString().slice(0, 10)}
                        {overdue && <span className="ml-2 text-rose-600">({daysPast}d)</span>}
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
            <tfoot className="bg-slate-50">
              <tr className="text-sm font-semibold">
                <td
                  colSpan={5}
                  className="px-4 py-3 text-right text-xs uppercase tracking-wide text-slate-500"
                >
                  Totals
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                  {formatCents(totalBilled)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                  {formatCents(bills.reduce((s, b) => s + b.paidCents, 0n))}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                  {formatCents(totalBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">Showing up to 250 bills.</p>
    </div>
  );
}
