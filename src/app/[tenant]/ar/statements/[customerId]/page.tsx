import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { getActivityStatement } from "@/lib/accounting/customer-statements";
import { formatCents } from "@/lib/accounting/ledger";
import { PrintButton } from "@/app/[tenant]/payroll/forms/PrintButton";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function CustomerStatementPage({
  params,
  searchParams,
}: {
  params: { tenant: string; customerId: string };
  searchParams: { asOf?: string; from?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const asOf = searchParams.asOf ? new Date(searchParams.asOf) : new Date();
  // Default period: last 90 days
  const periodStart = searchParams.from
    ? new Date(searchParams.from)
    : (() => {
        const d = new Date(asOf);
        d.setDate(d.getDate() - 90);
        return d;
      })();

  let statement;
  try {
    statement = await getActivityStatement({
      tenantId: auth.tenant.id,
      entityId: entity.id,
      customerId: params.customerId,
      periodStart,
      asOf,
    });
  } catch {
    notFound();
  }

  const asOfStr = fmtDate(asOf);
  const fromStr = fmtDate(periodStart);

  return (
    <div className="mx-auto max-w-4xl p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between no-print">
        <Link
          href={`/${params.tenant}/ar/statements?asOf=${asOfStr}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to statements
        </Link>
        <div className="flex items-center gap-2">
          <form method="get" className="flex items-end gap-2">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600">From</span>
              <input
                type="date"
                name="from"
                defaultValue={fromStr}
                className="mt-1 rounded-md border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600">To</span>
              <input
                type="date"
                name="asOf"
                defaultValue={asOfStr}
                className="mt-1 rounded-md border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Update
            </button>
          </form>
          <PrintButton />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">From</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{statement.entity.name}</div>
            <div className="text-xs text-slate-500">Currency: {statement.entity.baseCurrency}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold uppercase tracking-wide text-slate-900">Statement</div>
            <div className="mt-1 text-xs text-slate-500">As of {asOfStr}</div>
            <div className="text-xs text-slate-500">Period: {fromStr} → {asOfStr}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Bill to</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{statement.customer.name}</div>
            {statement.customer.email && (
              <div className="text-xs text-slate-600">{statement.customer.email}</div>
            )}
            {statement.customer.billingAddress && (
              <div className="mt-1 whitespace-pre-line text-xs text-slate-600">
                {statement.customer.billingAddress}
              </div>
            )}
          </div>
          <div className="rounded-md bg-slate-50 p-4 print:bg-white print:p-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">Amount due</div>
            <div className="mt-1 text-3xl font-bold text-slate-900">
              {formatCents(statement.endingBalanceCents)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {statement.totalOutstandingCents !== statement.endingBalanceCents && (
                <>Open invoices total: {formatCents(statement.totalOutstandingCents)}</>
              )}
            </div>
          </div>
        </div>

        {/* Activity table */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Account activity</h2>
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 print:bg-white">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Reference</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Charges</th>
                  <th className="px-3 py-2 text-right font-medium">Payments</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-slate-50/50 print:bg-white">
                  <td className="px-3 py-2 text-sm" colSpan={6}>
                    <span className="font-medium text-slate-700">Beginning balance ({fromStr})</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                    {formatCents(statement.beginningBalanceCents)}
                  </td>
                </tr>
                {statement.activity.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                      No activity in this period.
                    </td>
                  </tr>
                ) : (
                  statement.activity.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-sm text-slate-700">{fmtDate(row.date)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={
                            row.kind === "INVOICE"
                              ? "rounded bg-blue-50 px-2 py-0.5 text-blue-700 print:bg-white print:px-0"
                              : "rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 print:bg-white print:px-0"
                          }
                        >
                          {row.kind === "INVOICE" ? "Invoice" : "Payment"}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.reference}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{row.description}</td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                        {row.chargeCents > 0n ? formatCents(row.chargeCents) : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                        {row.paymentCents > 0n ? `(${formatCents(row.paymentCents)})` : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                        {formatCents(row.runningBalanceCents)}
                      </td>
                    </tr>
                  ))
                )}
                <tr className="bg-slate-50 font-semibold print:bg-white">
                  <td className="px-3 py-2 text-sm" colSpan={6}>
                    Ending balance ({asOfStr})
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                    {formatCents(statement.endingBalanceCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Aging summary */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Aging summary</h2>
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 print:bg-white">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-right font-medium">Current</th>
                  <th className="px-3 py-2 text-right font-medium">1–30 days</th>
                  <th className="px-3 py-2 text-right font-medium">31–60 days</th>
                  <th className="px-3 py-2 text-right font-medium">61–90 days</th>
                  <th className="px-3 py-2 text-right font-medium">Over 90 days</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                    {formatCents(statement.buckets.current)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                    {formatCents(statement.buckets.d1_30)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-amber-700">
                    {formatCents(statement.buckets.d31_60)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-amber-700">
                    {formatCents(statement.buckets.d61_90)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-rose-700">
                    {formatCents(statement.buckets.over90)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {formatCents(statement.totalOutstandingCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Open invoices */}
        {statement.openInvoices.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-slate-900">Open invoices</h2>
            <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 print:bg-white">
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left font-medium">Invoice #</th>
                    <th className="px-3 py-2 text-left font-medium">Issue date</th>
                    <th className="px-3 py-2 text-left font-medium">Due date</th>
                    <th className="px-3 py-2 text-right font-medium">Days overdue</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.openInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">
                        {inv.invoiceNumber ? `INV-${String(inv.invoiceNumber).padStart(4, "0")}` : "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">{fmtDate(inv.issueDate)}</td>
                      <td className="px-3 py-2 text-sm text-slate-700">{fmtDate(inv.dueDate)}</td>
                      <td className="px-3 py-2 text-right text-sm">
                        {inv.daysOverdue > 0 ? (
                          <span className={inv.daysOverdue > 30 ? "font-semibold text-rose-700" : "text-amber-700"}>
                            {inv.daysOverdue}d
                          </span>
                        ) : (
                          <span className="text-emerald-700">Current</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                        {formatCents(inv.totalCents)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                        {formatCents(inv.paidCents)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums">
                        {formatCents(inv.balanceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Please remit payment to the address on file. Questions about this statement? Reply to the
          email this was sent from.
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: letter; margin: 0.5in; }
        }
      `}</style>
    </div>
  );
}
