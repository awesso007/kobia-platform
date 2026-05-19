import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { createItem, toggleItem, adjustQty } from "@/app/actions/item-actions";

export const dynamic = "force-dynamic";

function qtyDisplay(milli: bigint): string {
  const neg = milli < 0n;
  const abs = neg ? -milli : milli;
  const whole = abs / 1000n;
  const frac = (abs % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

export default async function ItemsPage({ params }: { params: { tenant: string } }) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const [items, revenueAccounts, assetAccounts, expenseAccounts] = await Promise.all([
    db.item.findMany({
      where: { tenantId: auth.tenant.id, entityId: entity.id },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { revenueAccount: true, inventoryAccount: true, cogsAccount: true },
    }),
    db.account.findMany({
      where: { tenantId: auth.tenant.id, entityId: entity.id, type: "REVENUE", isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    db.account.findMany({
      where: { tenantId: auth.tenant.id, entityId: entity.id, type: "ASSET", isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    db.account.findMany({
      where: { tenantId: auth.tenant.id, entityId: entity.id, type: "EXPENSE", isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const inventoryCount = items.filter((i) => i.type === "INVENTORY" && i.isActive).length;
  const lowStock = items.filter(
    (i) => i.type === "INVENTORY" && i.isActive && i.qtyOnHandMilli <= 0n,
  ).length;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Items</h1>
      <p className="mt-1 text-sm text-slate-500">
        Products and services you sell. Inventory items track on-hand quantity and post COGS on
        sale.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total items</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Inventory SKUs</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{inventoryCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Out of stock</p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">{lowStock}</p>
        </div>
      </div>

      <form
        action={createItem}
        className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-3"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <label className="block md:col-span-2">
          <span className="text-xs font-medium text-slate-700">Name</span>
          <input
            name="name"
            required
            maxLength={120}
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Type</span>
          <select
            name="type"
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          >
            <option value="SERVICE">Service</option>
            <option value="INVENTORY">Inventory</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">SKU (optional)</span>
          <input
            name="sku"
            maxLength={60}
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Unit price ($)</span>
          <input
            name="unitPrice"
            placeholder="0.00"
            inputMode="decimal"
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Unit cost ($)</span>
          <input
            name="unitCost"
            placeholder="0.00"
            inputMode="decimal"
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Qty on hand (Inventory)</span>
          <input
            name="qtyOnHand"
            placeholder="0"
            inputMode="decimal"
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block md:col-span-3">
          <span className="text-xs font-medium text-slate-700">Description</span>
          <input
            name="description"
            maxLength={500}
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Revenue account *</span>
          <select
            name="revenueAccountId"
            required
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          >
            {revenueAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Inventory account (asset)</span>
          <select
            name="inventoryAccountId"
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          >
            <option value="">—</option>
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">COGS account (expense)</span>
          <select
            name="cogsAccountId"
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm"
          >
            <option value="">—</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-3 flex justify-end">
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Add item
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No items yet. Add your first product or service above.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                <th className="px-4 py-2 text-right font-medium">On hand</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={`border-t border-slate-100 ${it.isActive ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-900">{it.name}</p>
                    {it.sku && <p className="text-xs text-slate-400">SKU: {it.sku}</p>}
                    <p className="text-xs text-slate-500">
                      Revenue: {it.revenueAccount.code} {it.revenueAccount.name}
                      {it.type === "INVENTORY" && it.inventoryAccount && it.cogsAccount && (
                        <>
                          {" "}
                          • Inv: {it.inventoryAccount.code} • COGS: {it.cogsAccount.code}
                        </>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs ${it.type === "INVENTORY" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                      {it.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCents(it.unitPriceCents)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCents(it.unitCostCents)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {it.type === "INVENTORY" ? qtyDisplay(it.qtyOnHandMilli) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {it.type === "INVENTORY" && it.isActive && (
                      <form action={adjustQty} className="inline-flex items-center gap-1">
                        <input type="hidden" name="tenantSlug" value={params.tenant} />
                        <input type="hidden" name="itemId" value={it.id} />
                        <input
                          name="delta"
                          placeholder="qty"
                          className="w-16 rounded border-slate-200 px-1 py-0.5 text-xs"
                          required
                        />
                        <button name="sign" value="in" className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">
                          In
                        </button>
                        <button name="sign" value="out" className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-100">
                          Out
                        </button>
                      </form>
                    )}
                    <form action={toggleItem} className="ml-2 inline">
                      <input type="hidden" name="tenantSlug" value={params.tenant} />
                      <input type="hidden" name="itemId" value={it.id} />
                      <button className="text-xs text-slate-500 hover:text-slate-700">
                        {it.isActive ? "Archive" : "Reactivate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-400">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-600">
          ← Books
        </Link>
      </div>
    </div>
  );
}
