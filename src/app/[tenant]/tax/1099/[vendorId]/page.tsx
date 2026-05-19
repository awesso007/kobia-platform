import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

function maskTaxId(taxId: string): string {
  const clean = taxId.replace(/\D/g, "");
  if (clean.length < 4) return "•••";
  const last4 = clean.slice(-4);
  if (clean.length === 9) return `XXX-XX-${last4}`;
  return `XX-XXX${last4}`;
}

export default async function Tax1099RecipientPage({
  params,
  searchParams,
}: {
  params: { tenant: string; vendorId: string };
  searchParams: { year?: string; reveal?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const now = new Date();
  const year = Number(searchParams.year ?? now.getUTCFullYear());
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const vendor = await db.vendor.findFirst({
    where: {
      id: params.vendorId,
      tenantId: auth.tenant.id,
      entityId: entity.id,
      is1099Vendor: true,
    },
    include: {
      bills: {
        select: {
          payments: {
            where: { paymentDate: { gte: yearStart, lt: yearEnd } },
            select: { amountCents: true, paymentDate: true },
            orderBy: { paymentDate: "asc" },
          },
        },
      },
    },
  });

  if (!vendor) notFound();

  const allPayments = vendor.bills.flatMap((b) => b.payments);
  const totalCents = allPayments.reduce((s, p) => s + p.amountCents, 0n);

  const reveal = searchParams.reveal === "1";
  const displayTaxId = vendor.taxId
    ? reveal
      ? vendor.taxId
      : maskTaxId(vendor.taxId)
    : "—";

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
          href={`/${params.tenant}/tax/1099?year=${year}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to 1099 list
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/${params.tenant}/tax/1099/${vendor.id}?year=${year}&reveal=${reveal ? "0" : "1"}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {reveal ? "Hide TIN" : "Reveal TIN"}
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="mx-auto max-w-3xl bg-white p-10 shadow print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500">
              Form 1099-NEC
            </div>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Nonemployee Compensation
            </h1>
            <div className="mt-1 text-sm text-slate-500">
              Tax year {year}
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>OMB No. 1545-0116</div>
            <div className="mt-1">For internal preparation — do not file</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-md border border-slate-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Payer
            </div>
            <div className="mt-2 text-sm text-slate-900">
              {entity.name}
            </div>
            <div className="text-xs text-slate-500">
              (Your business information)
            </div>
          </div>
          <div className="rounded-md border border-slate-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Recipient
            </div>
            <div className="mt-2 text-sm text-slate-900">{vendor.name}</div>
            {vendor.remitToAddress && (
              <div className="mt-1 whitespace-pre-line text-xs text-slate-600">
                {vendor.remitToAddress}
              </div>
            )}
            {vendor.email && (
              <div className="mt-1 text-xs text-slate-600">{vendor.email}</div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-md border border-slate-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Recipient TIN
            </div>
            <div className="mt-2 font-mono text-sm text-slate-900">
              {displayTaxId}
            </div>
            {!vendor.taxId && (
              <div className="mt-1 text-xs text-rose-600">
                Missing — request a W-9 before filing
              </div>
            )}
          </div>
          <div className="rounded-md border-2 border-slate-900 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Box 1 — Nonemployee compensation
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
              {formatCents(totalCents)}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Payment detail
          </div>
          <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allPayments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-4 text-center text-slate-400"
                    >
                      No payments in {year}.
                    </td>
                  </tr>
                ) : (
                  allPayments.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-700">
                        {p.paymentDate.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                        {formatCents(p.amountCents)}
                      </td>
                    </tr>
                  ))
                )}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-2 text-right text-slate-700">
                    Total Box 1
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-900">
                    {formatCents(totalCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          This is a preparation worksheet. Official 1099-NEC forms must be
          filed with the IRS by January 31. KOBIA Accounting · Generated{" "}
          {new Date().toISOString().slice(0, 10)}
        </div>
      </div>
    </div>
  );
}
