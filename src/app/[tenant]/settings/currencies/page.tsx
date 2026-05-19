import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { db } from "@/lib/db";
import { SUPPORTED_CURRENCIES } from "@/lib/accounting/fx";
import { upsertRateAction, deleteRateAction } from "@/app/actions/fx-actions";

export const dynamic = "force-dynamic";

export default async function CurrenciesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  const baseCurrency = entity?.baseCurrency ?? "USD";

  const rates = await db.exchangeRate.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: [{ rateDate: "desc" }, { fromCurrency: "asc" }],
    take: 200,
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        Exchange rates
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Your base currency is <span className="font-semibold">{baseCurrency}</span>. Add manual rates for any
        currency you transact in. KOBIA picks the most recent rate at or before each transaction date.
      </p>

      {/* Add rate */}
      <form
        action={upsertRateAction}
        className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-6 dark:border-slate-800 dark:bg-slate-950"
      >
        <input type="hidden" name="slug" value={params.tenant} />
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">From</label>
          <select
            name="fromCurrency"
            required
            defaultValue="USD"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">To</label>
          <select
            name="toCurrency"
            required
            defaultValue={baseCurrency}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Rate (1 From = N To)
          </label>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            name="rate"
            required
            placeholder="1.3650"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Effective date</label>
          <input
            type="date"
            name="rateDate"
            defaultValue={today}
            required
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="sm:col-span-1 flex items-end">
          <button
            type="submit"
            className="w-full rounded-md bg-[color:var(--primary,#0ea5e9)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:brightness-110"
          >
            Save rate
          </button>
        </div>
      </form>

      {/* Existing rates */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Pair</th>
              <th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2">Effective</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No rates yet. Add your first rate above.
                </td>
              </tr>
            )}
            {rates.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                <td className="px-4 py-2 font-medium">
                  {r.fromCurrency} → {r.toCurrency}
                </td>
                <td className="px-4 py-2 text-right font-mono">{r.rate.toFixed(6)}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                  {r.rateDate.toLocaleDateString("en-US", {
                    timeZone: "UTC",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{r.source ?? "manual"}</td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteRateAction} className="inline">
                    <input type="hidden" name="slug" value={params.tenant} />
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Tip: rates are looked up &ldquo;most recent at or before the transaction date,&rdquo; so you only need to add a rate
        when it changes meaningfully. For daily auto-sync via ECB / Frankfurter, watch this space — coming next.
      </p>
    </div>
  );
}
