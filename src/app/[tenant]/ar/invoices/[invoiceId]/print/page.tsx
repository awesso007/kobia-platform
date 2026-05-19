import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { PrintButton } from "@/app/[tenant]/payroll/forms/PrintButton";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatQty(q: bigint): string {
  const whole = q / 1000n;
  const frac = q % 1000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(3, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

export default async function InvoicePrintPage({
  params,
}: {
  params: { tenant: string; invoiceId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const [invoice, tenant] = await Promise.all([
    db.invoice.findFirst({
      where: {
        id: params.invoiceId,
        tenantId: auth.tenant.id,
        entityId: entity.id,
      },
      include: {
        customer: { select: { name: true, email: true, billingAddress: true } },
        lines: {
          include: { account: { select: { code: true, name: true } } },
          orderBy: { lineNumber: "asc" },
        },
        payments: {
          select: { amountCents: true, paymentDate: true, method: true, reference: true },
          orderBy: { paymentDate: "asc" },
        },
      },
    }),
    db.tenant.findUnique({
      where: { id: auth.tenant.id },
      select: { name: true, logoUrl: true, tier: true, hideKobiaBrand: true },
    }),
  ]);

  if (!invoice) notFound();

  const invoiceLabel = invoice.invoiceNumber
    ? `INV-${String(invoice.invoiceNumber).padStart(4, "0")}`
    : "DRAFT";

  // Brand should only be hidden on SOLO / FIRM / FIRM_PLUS plans (Lock EEEE)
  const showKobiaBrand = !tenant?.hideKobiaBrand && (!tenant?.tier || ["FREE", "ENTRY"].includes(tenant.tier));

  // Subtotal already on invoice; tax is invoice.taxCents
  const subtotal = invoice.subtotalCents;
  const tax = invoice.taxCents;
  const total = invoice.totalCents;
  const paid = invoice.paidCents;
  const balance = invoice.balanceCents;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Toolbar (hidden when printing) */}
      <div className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link
            href={`/${params.tenant}/ar/invoices/${params.invoiceId}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Back to invoice
          </Link>
          <div className="flex items-center gap-2">
            <PrintButton label="Print / Save as PDF" />
          </div>
        </div>
      </div>

      {/* Invoice page — letter size */}
      <div className="mx-auto my-8 max-w-4xl bg-white p-12 shadow-lg print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {/* Header: brand left, invoice meta right */}
        <div className="flex items-start justify-between border-b-2 border-slate-200 pb-8">
          <div>
            {tenant?.logoUrl ? (
              // Using <img> intentionally for print compatibility (next/image needs JS at print time)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                className="mb-3 h-16 max-w-xs object-contain"
              />
            ) : (
              <div className="mb-3 text-2xl font-bold text-slate-900">{tenant?.name ?? entity.name}</div>
            )}
            <div className="text-sm font-semibold text-slate-700">{entity.name}</div>
            <div className="text-xs text-slate-500">Base currency: {entity.baseCurrency ?? "USD"}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold uppercase tracking-wide text-slate-900">Invoice</div>
            <div className="mt-2 font-mono text-sm text-slate-700">{invoiceLabel}</div>
            <div className="mt-1 text-xs text-slate-500">
              <div>Issued: {fmtDate(invoice.issueDate)}</div>
              <div>Due: {fmtDate(invoice.dueDate)}</div>
            </div>
            <div className="mt-2 inline-block">
              <StatusPill status={invoice.status} />
            </div>
          </div>
        </div>

        {/* Bill-to + Amount due */}
        <div className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Bill to</div>
            <div className="mt-1 text-base font-semibold text-slate-900">{invoice.customer.name}</div>
            {invoice.customer.email && (
              <div className="text-sm text-slate-600">{invoice.customer.email}</div>
            )}
            {invoice.customer.billingAddress && (
              <div className="mt-1 whitespace-pre-line text-sm text-slate-600">
                {invoice.customer.billingAddress}
              </div>
            )}
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-6 print:border-slate-300 print:bg-white">
            <div className="text-xs uppercase tracking-wide text-slate-500">Amount due</div>
            <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
              {formatCents(balance)} <span className="text-sm font-normal text-slate-500">{invoice.currency}</span>
            </div>
            {paid > 0n && balance > 0n && (
              <div className="mt-1 text-xs text-slate-500">
                ({formatCents(paid)} of {formatCents(total)} received)
              </div>
            )}
            {balance === 0n && invoice.status === "PAID" && (
              <div className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Paid in full
              </div>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="mt-10">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left">
                <th className="py-2 text-xs uppercase tracking-wide text-slate-500">Description</th>
                <th className="py-2 text-right text-xs uppercase tracking-wide text-slate-500">Qty</th>
                <th className="py-2 text-right text-xs uppercase tracking-wide text-slate-500">Rate</th>
                <th className="py-2 text-right text-xs uppercase tracking-wide text-slate-500">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4">
                    <div className="text-sm text-slate-900">{l.description}</div>
                    <div className="text-xs text-slate-500">
                      {l.account.code} · {l.account.name}
                    </div>
                  </td>
                  <td className="py-3 text-right font-mono text-sm tabular-nums text-slate-700">
                    {formatQty(l.quantityMilli)}
                  </td>
                  <td className="py-3 text-right font-mono text-sm tabular-nums text-slate-700">
                    {formatCents(l.unitPriceCents)}
                  </td>
                  <td className="py-3 text-right font-mono text-sm tabular-nums text-slate-900">
                    {formatCents(l.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-2 text-right text-sm text-slate-600">
                  Subtotal
                </td>
                <td className="py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                  {formatCents(subtotal)}
                </td>
              </tr>
              {tax > 0n && (
                <tr>
                  <td colSpan={3} className="py-2 text-right text-sm text-slate-600">
                    Sales tax{invoice.taxRateBps ? ` (${(invoice.taxRateBps / 100).toFixed(2)}%)` : ""}
                  </td>
                  <td className="py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                    {formatCents(tax)}
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-slate-300">
                <td colSpan={3} className="py-3 text-right text-base font-semibold text-slate-900">
                  Total
                </td>
                <td className="py-3 text-right font-mono text-base font-bold tabular-nums text-slate-900">
                  {formatCents(total)} {invoice.currency}
                </td>
              </tr>
              {paid > 0n && (
                <>
                  <tr>
                    <td colSpan={3} className="py-1 text-right text-sm text-slate-600">
                      Payments received
                    </td>
                    <td className="py-1 text-right font-mono text-sm tabular-nums text-emerald-700">
                      ({formatCents(paid)})
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td colSpan={3} className="py-2 text-right text-base font-semibold text-slate-900">
                      Balance due
                    </td>
                    <td className="py-2 text-right font-mono text-base font-bold tabular-nums text-slate-900">
                      {formatCents(balance)}
                    </td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>

        {/* Memo */}
        {invoice.memo && (
          <div className="mt-8 rounded-md bg-slate-50 p-4 print:border print:border-slate-200 print:bg-white">
            <div className="text-xs uppercase tracking-wide text-slate-500">Notes</div>
            <div className="mt-1 whitespace-pre-line text-sm text-slate-700">{invoice.memo}</div>
          </div>
        )}

        {/* Payment history */}
        {invoice.payments.length > 0 && (
          <div className="mt-8">
            <div className="text-xs uppercase tracking-wide text-slate-500">Payment history</div>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {invoice.payments.map((p, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-700">{fmtDate(p.paymentDate)}</td>
                    <td className="py-1.5 text-slate-700">
                      {p.method ?? "Payment"}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-emerald-700">
                      {formatCents(p.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          {invoice.dueDate >= new Date() ? (
            <p>Thank you for your business. Please remit payment by {fmtDate(invoice.dueDate)}.</p>
          ) : (
            <p>This invoice is past due. Please remit payment as soon as possible.</p>
          )}
          {showKobiaBrand && (
            <p className="mt-2 text-[10px] text-slate-400">
              Powered by KOBIA.AI
            </p>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { size: letter; margin: 0.5in; }
        }
      `}</style>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    DRAFT: { bg: "bg-slate-100", text: "text-slate-800", label: "Draft" },
    OPEN: { bg: "bg-blue-100", text: "text-blue-800", label: "Open" },
    PARTIAL: { bg: "bg-amber-100", text: "text-amber-900", label: "Partial" },
    PAID: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Paid" },
    VOID: { bg: "bg-rose-100", text: "text-rose-800", label: "Void" },
  };
  const s = map[status] ?? map.OPEN!;
  return (
    <span className={`inline-block rounded-full ${s.bg} px-2 py-0.5 text-xs font-semibold ${s.text}`}>
      {s.label}
    </span>
  );
}
