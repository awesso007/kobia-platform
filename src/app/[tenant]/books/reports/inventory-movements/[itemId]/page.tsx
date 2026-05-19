import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  getItemMovementReport,
  formatQtyMilli,
} from "@/lib/accounting/inventory-movements";

export const dynamic = "force-dynamic";

export default async function ItemMovementsPage({
  params,
}: {
  params: { tenant: string; itemId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const report = await getItemMovementReport({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    itemId: params.itemId,
  });
  if (!report) notFound();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/books/reports/inventory-movements`}
          className="hover:text-slate-700"
        >
          ← All inventory items
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{report.itemName}</h1>
        {report.sku && (
          <p className="mt-1 text-sm text-slate-500 font-mono">SKU: {report.sku}</p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="On Hand" value={formatQtyMilli(report.currentQtyMilli)} />
        <Card label="Unit Cost" value={formatCents(report.unitCostCents)} />
        <Card label="On-Hand Value" value={formatCents(report.currentValueCents)} accent />
        <Card label="Lifetime Sold" value={formatQtyMilli(report.totalSoldMilli)} />
        <Card label="Lifetime Sales" value={formatCents(report.totalSalesCents)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-700">Movement History</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Reference</th>
              <th className="px-4 py-2 text-right font-medium">Qty Δ</th>
              <th className="px-4 py-2 text-right font-medium">Unit Cost</th>
              <th className="px-4 py-2 text-right font-medium">Cost Δ</th>
            </tr>
          </thead>
          <tbody>
            {report.movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No movements yet. Sales of this item on posted invoices will appear here.
                </td>
              </tr>
            ) : (
              report.movements.map((m, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">
                    {new Date(m.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        m.type === "SALE"
                          ? "bg-rose-50 text-rose-700"
                          : m.type === "PURCHASE"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {m.type}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={
                        m.refType === "INVOICE"
                          ? `/${params.tenant}/ar/invoices/${m.refId}`
                          : `/${params.tenant}/books/journal/${m.refId}`
                      }
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {m.refLabel}
                    </Link>
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums font-medium ${
                      m.qtyChangeMilli < 0n ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {formatQtyMilli(m.qtyChangeMilli)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {formatCents(m.unitCostCents)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      m.costDeltaCents < 0n ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {formatCents(m.costDeltaCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">About this report</p>
        <p className="mt-1">
          Movements come from posted invoice lines that reference this item. Each sale
          decrements on-hand quantity and posts COGS at the item&rsquo;s average unit cost.
          Manual stock adjustments coming soon.
        </p>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
