import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import PrintReceiptButton from "./PrintReceiptButton";

export const dynamic = "force-dynamic";

export default async function PaymentReceiptPage({
  params,
}: {
  params: { tenant: string; invoiceId: string; paymentId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const payment = await db.invoicePayment.findFirst({
    where: {
      id: params.paymentId,
      tenantId: auth.tenant.id,
      invoiceId: params.invoiceId,
      invoice: { entityId: entity.id },
    },
    include: {
      invoice: {
        include: {
          customer: { select: { name: true, email: true, phone: true } },
        },
      },
      cashAccount: { select: { name: true } },
    },
  });

  if (!payment) notFound();

  const inv = payment.invoice;
  // Receipt number = "INV<n>-R<paymentSeq>" — compute paymentSeq by ordering
  const allPayments = await db.invoicePayment.findMany({
    where: { invoiceId: inv.id },
    orderBy: { paymentDate: "asc" },
    select: { id: true },
  });
  const seq = allPayments.findIndex((p) => p.id === payment.id) + 1;
  const receiptNumber = `INV${inv.invoiceNumber}-R${seq}`;

  return (
    <div className="bg-slate-100 print:bg-white min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
        @page { size: letter; margin: 0.5in; }
      `}</style>

      <div className="no-print mx-auto max-w-3xl px-4 pt-6 pb-2 flex items-center justify-between">
        <Link
          href={`/${params.tenant}/ar/invoices/${inv.id}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to invoice
        </Link>
        <PrintReceiptButton />
      </div>

      <div className="mx-auto max-w-3xl bg-white p-10 shadow print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500">
              {entity.name}
            </div>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Payment Receipt
            </h1>
            <div className="mt-1 text-sm text-slate-500">
              Receipt #{receiptNumber}
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
              PAID
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {payment.paymentDate.toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Received from
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">
              {inv.customer.name}
            </div>
            {inv.customer.email && (
              <div className="text-sm text-slate-600">
                {inv.customer.email}
              </div>
            )}
            {inv.customer.phone && (
              <div className="text-sm text-slate-600">
                {inv.customer.phone}
              </div>
            )}
          </div>

          <div className="md:text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Amount received
            </div>
            <div className="mt-1 text-3xl font-bold text-emerald-700 tabular-nums">
              {formatCents(payment.amountCents)}
            </div>
            <div className="text-xs text-slate-500">{inv.currency}</div>
          </div>
        </div>

        <div className="mt-8 rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2 text-slate-500 w-1/3">
                  Applied to invoice
                </td>
                <td className="px-4 py-2 font-medium text-slate-900">
                  #{inv.invoiceNumber}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-slate-500">Payment method</td>
                <td className="px-4 py-2 text-slate-700">
                  {payment.method ?? "—"}
                </td>
              </tr>
              {payment.reference && (
                <tr>
                  <td className="px-4 py-2 text-slate-500">Reference</td>
                  <td className="px-4 py-2 text-slate-700">
                    {payment.reference}
                  </td>
                </tr>
              )}
              <tr>
                <td className="px-4 py-2 text-slate-500">Deposited to</td>
                <td className="px-4 py-2 text-slate-700">
                  {payment.cashAccount.name}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <td className="px-4 py-2 text-slate-500">Invoice total</td>
                <td className="px-4 py-2 text-slate-900 tabular-nums">
                  {formatCents(inv.totalCents)}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <td className="px-4 py-2 text-slate-500">Total paid to date</td>
                <td className="px-4 py-2 text-slate-900 tabular-nums">
                  {formatCents(inv.paidCents)}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <td className="px-4 py-2 font-semibold text-slate-700">
                  Remaining balance
                </td>
                <td className="px-4 py-2 font-bold text-slate-900 tabular-nums">
                  {formatCents(inv.balanceCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-10 text-center text-sm text-slate-600">
          Thank you for your payment.
        </div>

        <div className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
          Generated by KOBIA Accounting · {new Date().toISOString().slice(0, 10)}
        </div>
      </div>
    </div>
  );
}
