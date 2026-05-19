import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { adjustItemStockAction } from "@/app/actions/inventory-adjustment-actions";

export const dynamic = "force-dynamic";

function qtyDisplay(milli: bigint): string {
  const neg = milli < 0n;
  const abs = neg ? -milli : milli;
  const whole = abs / 1000n;
  const frac = (abs % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

export default async function AdjustStockPage({
  params,
}: {
  params: { tenant: string; itemId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const item = await db.item.findFirst({
    where: {
      id: params.itemId,
      tenantId: auth.tenant.id,
      type: "INVENTORY",
    },
    include: {
      inventoryAccount: { select: { code: true, name: true } },
      entity: { select: { id: true, name: true } },
    },
  });

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-rose-700">
          Inventory item not found, or this item is not tracked as inventory.
        </p>
        <Link
          href={`/${params.tenant}/items`}
          className="mt-3 inline-block text-xs text-slate-500 hover:text-slate-700"
        >
          ← Back to items
        </Link>
      </div>
    );
  }

  // Offset accounts: prefer COGS + EXPENSE + OTHER_EXPENSE + OTHER_INCOME
  const offsetAccounts = await db.account.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: item.entityId,
      isActive: true,
      type: { in: ["COGS", "EXPENSE", "OTHER_EXPENSE", "OTHER_INCOME"] },
    },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });

  // Default-select the first account named "Inventory Adjustment(s)" if present.
  const defaultOffset = offsetAccounts.find((a) =>
    /inventory\s*adj/i.test(a.name),
  );

  const today = new Date().toISOString().slice(0, 10);
  const unitCostStr = formatCents(item.unitCostCents);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="text-xs text-slate-500">
        <Link href={`/${params.tenant}/items`} className="hover:text-slate-700">
          ← Items
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">Stock adjustment</h1>
      <p className="mt-1 text-sm text-slate-500">
        Set a new on-hand quantity. KOBIA will post a balanced journal entry to keep your
        inventory asset in sync with the count.
      </p>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">Item</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">{item.name}</p>
        {item.sku && <p className="text-xs text-slate-500">SKU: {item.sku}</p>}

        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase text-slate-500">Current on hand</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {qtyDisplay(item.qtyOnHandMilli)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Unit cost</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {unitCostStr}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Asset value</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {formatCents(
                (item.qtyOnHandMilli < 0n
                  ? -item.qtyOnHandMilli
                  : item.qtyOnHandMilli) * item.unitCostCents / 1000n,
              )}
            </p>
          </div>
        </div>

        {!item.inventoryAccountId && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            This item has no inventory asset account set. Open the item and set one before
            posting an adjustment.
          </div>
        )}
        {item.inventoryAccount && (
          <p className="mt-3 text-xs text-slate-500">
            Inventory account: {item.inventoryAccount.code} — {item.inventoryAccount.name}
          </p>
        )}
      </div>

      <form
        action={adjustItemStockAction}
        className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <input type="hidden" name="itemId" value={item.id} />

        <label className="block">
          <span className="text-xs font-medium text-slate-700">New on-hand quantity *</span>
          <input
            name="newQty"
            required
            inputMode="decimal"
            defaultValue={qtyDisplay(item.qtyOnHandMilli)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            placeholder="0"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Up to 3 decimal places. Difference vs. current count drives the journal entry.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Reason *</span>
          <input
            name="reason"
            required
            maxLength={200}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            placeholder="Physical count, shrinkage, breakage, donation, found stock…"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Offset account (P&amp;L) *
          </span>
          <select
            name="offsetAccountId"
            required
            defaultValue={defaultOffset?.id ?? ""}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          >
            <option value="" disabled>
              Choose an account…
            </option>
            {offsetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name} ({a.type})
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-400">
            Usually &quot;5200 Inventory Adjustments&quot; (COGS) for shrinkage and write-downs.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Adjustment date</span>
          <input
            type="date"
            name="adjustmentDate"
            defaultValue={today}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>

        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">How KOBIA posts this</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              Write-up (more on hand): Dr Inventory asset / Cr offset account (negative
              shrinkage).
            </li>
            <li>
              Write-down (less on hand): Dr offset / Cr Inventory — shrinkage hits the
              P&amp;L.
            </li>
            <li>
              Value = |delta qty| × current unit cost. Unit cost is not changed by this
              entry.
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/${params.tenant}/items`}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Cancel
          </Link>
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            type="submit"
          >
            Post adjustment
          </button>
        </div>
      </form>
    </div>
  );
}
