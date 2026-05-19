import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { ageBucket } from "@/lib/accounting/ar";
import { RecordPaymentButton } from "./RecordPaymentButton";

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
  DAYS_1_30: "1–30 days",
  DAYS_31_60: "31–60 days",
  DAYS_61_90: "61–90 days",
  DAYS_OVER_90: "90+ days",
};

function formatQty(q: bigint): string {
  // BigInt milli → display as decimal with up to 3 decimal places, trimmed
  const whole = q / 1000n;
  const frac = q % 1000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(3, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: { tenant: string; invoiceId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const invoice = await db.invoice.findFirst({
    where: {
      id: params.invoiceId,
      tenantId: auth.tenant.id,
      entityId: entity.id,
    },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
      payments: {
        include: {
          cashAccount: { select: { id: true, code: true, name: true } },
        },
        orderBy: { paymentDate: "desc" },
      },
    },
  });

  if (!invoice) notFound();

  // Load cash/bank accounts (ASSET, code starts with "10") for the payment form
  const cashAccounts = await db.account.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      type: "ASSET",
      isActive: true,
      code: { startsWith: "10" },
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const now = new Date();
  const isPastDue =
    (invoice.status === "OPEN" || invoice.status === "PARTIAL") && invoice.dueDate < now;
  const daysPastDue = isPastDue
    ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86400_000)
    : 0;
  const bucket = ageBucket(invoice.dueDate, now);

  const canRecordPayment =
    (invoice.status === "OPEN" || invoice.status === "PARTIAL") &&
    invoice.balanceCents > 0n &&
    cashAccounts.length > 0 &&
    ["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ar/invoices`} className="hover:text-slate-700">
          ← Back to invoices
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">
              Invoice #{invoice.invoiceNumber || "—"}
            </h1>
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                STATUS_BADGES[invoice.status] ?? STATUS_BADGES.DRAFT
              }`}
            >
              {invoice.status}
            </span>
            {isPastDue && (
              <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-1 text-xs font-medium text-rose-800 ring-1 ring-inset ring-rose-600/20">
                {daysPastDue}d past due · {BUCKET_LABEL[bucket]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} ·{" "}
            <Link
              href={`/${params.tenant}/ar/customers/${invoice.customer.id}`}
              className="font-medium text-blue-700 hover:underline"
            >
              {invoice.customer.name}
            </Link>
          </p>
        </div>

        <div className="flex gap-2">
          {invoice.postingJournalEntryId && (
            <Link
              href={`/${params.tenant}/books/journal/${invoice.postingJournalEntryId}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View posting JE
            </Link>
          )}
          {canRecordPayment && (
            <RecordPaymentButton
              tenantSlug={params.tenant}
              invoiceId={invoice.id}
              balanceCents={invoice.balanceCents.toString()}
              balanceDisplay={formatCents(invoice.balanceCents)}
              cashAccounts={cashAccounts}
            />
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Issue date</div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {invoice.issueDate.toLocaleDateString()}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Due date</div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {invoice.dueDate.toLocaleDateString()}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {formatCents(invoice.totalCents)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Balance due</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {formatCents(invoice.balanceCents)}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-left">Revenue account</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit price</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 text-slate-500">{l.lineNumber}</td>
                <td className="px-4 py-2 text-slate-900">{l.description}</td>
                <td className="px-4 py-2 text-slate-700">
                  <span className="font-mono text-xs text-slate-500">{l.account.code}</span>{" "}
                  {l.account.name}
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
              <td colSpan={5} className="px-4 py-2 text-right text-sm font-semibold text-slate-700">
                Subtotal
              </td>
              <td className="px-4 py-2 text-right text-sm font-semibold text-slate-900 tabular-nums">
                {formatCents(invoice.subtotalCents)}
              </td>
            </tr>
            {invoice.taxCents > 0n && (
              <tr>
                <td colSpan={5} className="px-4 py-2 text-right text-sm text-slate-700">
                  Tax
                </td>
                <td className="px-4 py-2 text-right text-sm text-slate-900 tabular-nums">
                  {formatCents(invoice.taxCents)}
                </td>
              </tr>
            )}
            <tr className="bg-slate-50">
              <td colSpan={5} className="px-4 py-2 text-right text-sm font-semibold text-slate-700">
                Total
              </td>
              <td className="px-4 py-2 text-right text-sm font-bold text-slate-900 tabular-nums">
                {formatCents(invoice.totalCents)}
              </td>
            </tr>
            {invoice.paidCents > 0n && (
              <>
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-right text-sm text-slate-700">
                    Paid
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-emerald-700 tabular-nums">
                    −{formatCents(invoice.paidCents)}
                  </td>
                </tr>
                <tr className="bg-slate-50">
                  <td
                    colSpan={5}
                    className="px-4 py-2 text-right text-sm font-semibold text-slate-700"
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

      {/* Payment history */}
      <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Payment history</h2>
        </div>
        {invoice.payments.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            No payments recorded yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Method</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Cash account</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-left">JE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-slate-700">
                    {p.paymentDate.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{p.method ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-700">{p.reference ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-700">
                    <span className="font-mono text-xs text-slate-500">{p.cashAccount.code}</span>{" "}
                    {p.cashAccount.name}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-700 tabular-nums">
                    {formatCents(p.amountCents)}
                  </td>
                  <td className="px-4 py-2">
                    {p.journalEntryId ? (
                      <Link
                        href={`/${params.tenant}/books/journal/${p.journalEntryId}`}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {invoice.memo && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Memo</div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{invoice.memo}</div>
        </div>
      )}
    </div>
  );
}
