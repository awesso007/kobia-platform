import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  listInventoryItemsWithStats,
  formatQtyMilli,
} from "@/lib/accounting/inventory-movements";

export const dynamic = "force-dynamic";

export default async function InventoryMovementsIndex({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const items = await listInventoryItemsWithStats({
    tenantId: auth.tenant.id,
    entityId: entity.id,
  });

  const totalValue = items.reduce((s, i) => s + i.valueCents, 0n);
  const totalSales = items.reduce((s, i) => s + i.lifetimeSalesCents, 0n);
  const totalUnits = items.reduce((s, i) => s + i.qtyOnHandMilli, 0n);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Books
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Movements</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · On-hand quantities, value, and lifetime sales per item
          </p>
        </div>
        <Link
          href={`/${params.tenant}/items`}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Manage Items
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="Items in stock" value={items.length.toString()} />
        <Card label="Total on-hand value" value={formatCents(totalValue)} accent />
        <Card label="Lifetime sales (units)" value={formatQtyMilli(totalUnits)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 text-right font-medium">On Hand</th>
              <th className="px-4 py-2 text-right font-medium">Unit Cost</th>
              <th className="px-4 py-2 text-right font-medium">Value</th>
              <th className="px-4 py-2 text-right font-medium">Lifetime Sold</th>
              <th className="px-4 py-2 text-right font-medium">Lifetime Sales</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  No inventory items. Add one in <Link href={`/${params.tenant}/items`} className="text-blue-700 hover:underline">Items & Inventory</Link>.
                </td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link
                      href={`/${params.tenant}/books/reports/inventory-movements/${i.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {i.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-500 font-mono text-xs">
                    {i.sku || "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      i.qtyOnHandMilli <= 0n ? "text-rose-600 font-semibold" : ""
                    }`}
                  >
                    {formatQtyMilli(i.qtyOnHandMilli)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {formatCents(i.unitCostCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatCents(i.valueCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {formatQtyMilli(i.lifetimeSoldMilli)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(i.lifetimeSalesCents)}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/${params.tenant}/books/reports/inventory-movements/${i.id}`}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      History →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot className="bg-slate-50 text-sm font-semibold">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right">
                  Totals
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCents(totalValue)}</td>
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCents(totalSales)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
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
      className={`rounded-lg border p-4 ${
        accent ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
