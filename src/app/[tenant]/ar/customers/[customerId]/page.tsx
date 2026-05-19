import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { ageBucket } from "@/lib/accounting/ar";
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

export default async function CustomerDetailPage({
  params,
}: {
  params: { tenant: string; customerId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const customer = await db.customer.findFirst({
    where: {
      id: params.customerId,
      tenantId: auth.tenant.id,
      entityId: entity.id,
    },
    include: {
      invoices: {
        include: {
          _count: { select: { lines: true, payments: true } },
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      },
    },
  });

  if (!customer) notFound();

  const now = new Date();
  const openInvoices = customer.invoices.filter((i) =>
    ["OPEN", "PARTIAL"].includes(i.status)
  );
  const openBalance = openInvoices.reduce((s, i) => s + i.balanceCents, 0n);
  const lifetimeRevenue = customer.invoices
    .filter((i) => ["OPEN", "PARTIAL", "PAID"].includes(i.status))
    .reduce((s, i) => s + i.totalCents, 0n);
  const lifetimePaid = customer.invoices.reduce((s, i) => s + i.paidCents, 0n);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ar/customers`} className="hover:text-slate-700">
          ← All customers
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
            {!customer.isActive && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
                Inactive
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Net {customer.defaultTermsDays} payment terms · {customer.invoices.length} total invoice
            {customer.invoices.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href={`/${params.tenant}/ar/invoices/new?customerId=${customer.id}`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New invoice for this customer
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open balance</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {formatCents(openBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lifetime billed</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
            {formatCents(lifetimeRevenue)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Excludes drafts and voids</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lifetime collected</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
            {formatCents(lifetimePaid)}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-1 text-slate-900">{customer.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt>
            <dd className="mt-1 text-slate-900">{customer.phone ?? "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Billing address</dt>
            <dd className="mt-1 whitespace-pre-line text-slate-900">{customer.billingAddress ?? "—"}</dd>
          </div>
          {customer.notes && (
            <div className="md:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</dt>
              <dd className="mt-1 whitespace-pre-line text-slate-900">{customer.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoices</h2>
        </div>
        {customer.invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No invoices yet.{" "}
            <Link
              href={`/${params.tenant}/ar/invoices/new?customerId=${customer.id}`}
              className="font-medium text-indigo-600 hover:text-indigo-700"
            >
              Create the first one →
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left font-medium">Inv #</th>
                <th className="px-4 py-2 text-left font-medium">Issued</th>
                <th className="px-4 py-2 text-left font-medium">Due</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {customer.invoices.map((inv) => {
                const href = `/${params.tenant}/ar/invoices/${inv.id}`;
                const isOpen = ["OPEN", "PARTIAL"].includes(inv.status);
                const daysPast = isOpen
                  ? Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400_000))
                  : 0;
                const bucket = isOpen ? ageBucket(inv.dueDate, now) : null;
                return (
                  <tr key={inv.id} className="hover:bg-blue-50">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={href} className="text-indigo-600 hover:text-indigo-700">
                        {inv.invoiceNumber > 0 ? `#${inv.invoiceNumber}` : <span className="text-slate-400">draft</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <Link href={href} className="block">{inv.issueDate.toISOString().slice(0, 10)}</Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <Link href={href} className="block">
                        {inv.dueDate.toISOString().slice(0, 10)}
                        {bucket && bucket !== "CURRENT" && (
                          <span className="ml-2 text-rose-600">({daysPast}d late)</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={href} className="block">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                            STATUS_BADGES[inv.status] ?? STATUS_BADGES.DRAFT
                          }`}
                        >
                          {inv.status}
                        </span>
                        {bucket && bucket !== "CURRENT" && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-rose-600">
                            {BUCKET_LABEL[bucket]}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                      <Link href={href} className="block">{formatCents(inv.totalCents)}</Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700">
                      <Link href={href} className="block">
                        {inv.paidCents > 0n ? formatCents(inv.paidCents) : ""}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                      <Link href={href} className="block">
                        {inv.balanceCents > 0n ? formatCents(inv.balanceCents) : ""}
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
