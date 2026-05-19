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

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  OPEN: "bg-amber-50 text-amber-800",
  PARTIAL: "bg-blue-50 text-blue-800",
  PAID: "bg-emerald-50 text-emerald-800",
  VOID: "bg-slate-200 text-slate-500",
};

function formatQty(q: bigint): string {
  const whole = q / 1000n;
  const frac = q % 1000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(3, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

export default async function PublicBillView({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  if (!token || token.length < 16) notFound();

  const bill = await db.bill.findUnique({
    where: { publicViewToken: token },
    include: {
      entity: { select: { name: true, baseCurrency: true } },
      vendor: { select: { name: true, email: true, remitToAddress: true } },
      lines: {
        include: { account: { select: { name: true } } },
        orderBy: { lineNumber: "asc" },
      },
      payments: {
        select: { paymentDate: true, amountCents: true, method: true, reference: true },
        orderBy: { paymentDate: "desc" },
      },
    },
  });

  if (!bill) notFound();
  if (bill.status === "DRAFT" || bill.status === "VOID") notFound();

  const totalPaid = bill.payments.reduce((s, p) => s + p.amountCents, 0n);
  const balance = bill.totalCents - totalPaid;

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
        @page { size: letter; margin: 0.5in; }
      `}</style>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="no-print mb-4 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-slate-500">
            Bill status from {bill.entity.name}
          </div>
          <a
            href="javascript:window.print()"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print / Save PDF
          </a>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Bill #{String(bill.billNumber).padStart(4, "0")}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  From: <span className="font-medium">{bill.entity.name}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Vendor: <span className="font-medium">{bill.vendor.name}</span>
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_TONE[bill.status] ?? "bg-slate-100 text-slate-700"}`}
              >
                {STATUS_LABEL[bill.status] ?? bill.status}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Bill date
                </p>
                <p className="mt-1 text-slate-900">
                  {new Date(bill.billDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Due date
                </p>
                <p className="mt-1 text-slate-900">
                  {new Date(bill.dueDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Vendor invoice #
                </p>
                <p className="mt-1 text-slate-900">
                  {bill.vendorBillNumber || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Amount due
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {formatCents(balance)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Line items
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-700">{l.description}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">
                      {formatQty(l.quantityMilli)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-600">
                      {formatCents(l.unitPriceCents)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-slate-900">
                      {formatCents(l.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right text-sm text-slate-500">
                    Subtotal
                  </td>
                  <td className="pt-3 text-right tabular-nums">
                    {formatCents(bill.subtotalCents)}
                  </td>
                </tr>
                {bill.taxCents > 0n && (
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-sm text-slate-500">
                      Tax
                    </td>
                    <td className="pt-1 text-right tabular-nums">
                      {formatCents(bill.taxCents)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="pt-2 text-right text-sm font-semibold">
                    Total
                  </td>
                  <td className="pt-2 text-right tabular-nums font-semibold">
                    {formatCents(bill.totalCents)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="pt-1 text-right text-sm text-emerald-700">
                    Paid
                  </td>
                  <td className="pt-1 text-right tabular-nums text-emerald-700">
                    −{formatCents(totalPaid)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="pt-2 text-right text-base font-bold">
                    Balance
                  </td>
                  <td className="pt-2 text-right tabular-nums text-base font-bold">
                    {formatCents(balance)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {bill.payments.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payment history
                </h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-1 font-medium">Date</th>
                      <th className="py-1 font-medium">Method</th>
                      <th className="py-1 font-medium">Reference</th>
                      <th className="py-1 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.payments.map((p, i) => (
                      <tr key={i} className="border-t border-slate-100 text-slate-700">
                        <td className="py-1.5">
                          {new Date(p.paymentDate).toLocaleDateString()}
                        </td>
                        <td className="py-1.5 capitalize">{p.method || "—"}</td>
                        <td className="py-1.5 text-slate-500">{p.reference || "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatCents(p.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {bill.memo && (
              <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Memo
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{bill.memo}</p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-center text-xs text-slate-500">
            This is a read-only view. Questions? Contact {bill.entity.name}.
          </div>
        </div>
      </div>
    </div>
  );
}
