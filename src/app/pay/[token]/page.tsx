import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  PARTIAL: "Partially paid",
  PAID: "Paid",
  VOID: "Void",
};

function formatQty(q: bigint): string {
  const whole = q / 1000n;
  const frac = q % 1000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(3, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

export default async function PublicInvoicePage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  if (!token || token.length < 16) notFound();

  const invoice = await db.invoice.findUnique({
    where: { publicViewToken: token },
    include: {
      entity: { select: { name: true, baseCurrency: true } },
      customer: { select: { name: true, email: true } },
      lines: {
        include: { account: { select: { name: true } } },
        orderBy: { lineNumber: "asc" },
      },
      payments: {
        select: { paymentDate: true, amountCents: true, method: true },
        orderBy: { paymentDate: "desc" },
      },
    },
  });

  if (!invoice) notFound();
  if (invoice.status === "DRAFT" || invoice.status === "VOID") notFound();

  const isPaid = invoice.status === "PAID";
  const isPartial = invoice.status === "PARTIAL";

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
        @page { size: letter; margin: 0.5in; }
      `}</style>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Action bar */}
        <div className="no-print mb-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-slate-500">
            Invoice from {invoice.entity.name}
          </div>
          <a
            href="javascript:window.print()"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print / Save PDF
          </a>
        </div>

        {/* Invoice card */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {invoice.entity.name}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Invoice #{invoice.invoiceNumber}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-semibold ${
                    isPaid
                      ? "bg-emerald-100 text-emerald-800"
                      : isPartial
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {STATUS_LABEL[invoice.status] ?? invoice.status}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Issued {invoice.issueDate.toLocaleDateString()}
                </div>
                <div className="text-xs text-slate-500">
                  Due {invoice.dueDate.toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Billed to
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {invoice.customer.name}
                </div>
                {invoice.customer.email && (
                  <div className="text-sm text-slate-600">
                    {invoice.customer.email}
                  </div>
                )}
              </div>
              <div className="md:text-right">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Amount due
                </div>
                <div
                  className={`mt-1 text-3xl font-bold tabular-nums ${
                    isPaid ? "text-emerald-700" : "text-slate-900"
                  }`}
                >
                  {formatCents(invoice.balanceCents)}
                </div>
                <div className="text-xs text-slate-500">
                  {invoice.currency}
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Unit price</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 text-slate-900">
                        {l.description}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700 tabular-nums">
                        {formatQty(l.quantityMilli)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700 tabular-nums">
                        {formatCents(l.unitPriceCents)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-slate-900 tabular-nums">
                        {formatCents(l.amountCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50">
                    <td
                      colSpan={3}
                      className="px-4 py-2 text-right text-sm font-semibold text-slate-700"
                    >
                      Subtotal
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-slate-900 tabular-nums">
                      {formatCents(invoice.subtotalCents)}
                    </td>
                  </tr>
                  {invoice.taxCents > 0n && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-2 text-right text-sm text-slate-700"
                      >
                        Tax
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-slate-900 tabular-nums">
                        {formatCents(invoice.taxCents)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td
                      colSpan={3}
                      className="px-4 py-2 text-right text-sm font-semibold text-slate-700"
                    >
                      Total
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-slate-900 tabular-nums">
                      {formatCents(invoice.totalCents)}
                    </td>
                  </tr>
                  {invoice.paidCents > 0n && (
                    <>
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-2 text-right text-sm text-slate-700"
                        >
                          Paid
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-emerald-700 tabular-nums">
                          −{formatCents(invoice.paidCents)}
                        </td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td
                          colSpan={3}
                          className="px-4 py-2 text-right text-sm font-bold text-slate-700"
                        >
                          Balance due
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-bold text-slate-900 tabular-nums">
                          {formatCents(invoice.balanceCents)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {invoice.memo && (
              <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Notes
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {invoice.memo}
                </div>
              </div>
            )}

            {invoice.payments.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Payment history
                </div>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {invoice.payments.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-slate-700">
                        {p.paymentDate.toLocaleDateString()}
                        {p.method ? ` · ${p.method}` : ""}
                      </span>
                      <span className="font-mono tabular-nums text-emerald-700">
                        {formatCents(p.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-center text-xs text-slate-500">
            Questions about this invoice? Reply to the email you received from{" "}
            {invoice.entity.name}.
          </div>
        </div>

        <div className="no-print mt-6 text-center text-xs text-slate-400">
          Powered by KOBIA Accounting
        </div>
      </div>
    </div>
  );
}
