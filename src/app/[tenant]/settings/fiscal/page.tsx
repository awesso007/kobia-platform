import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateEntityFiscal } from "@/app/actions/tenant-settings-actions";

export const dynamic = "force-dynamic";

const CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "AUD",
  "NZD",
  "JPY",
  "MXN",
  "INR",
  "CNY",
];

export default async function FiscalSettingsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entities = await db.entity.findMany({
    where: { tenantId: auth.tenant.id, isActive: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Fiscal Year & Currency</h1>
      <p className="mt-1 text-sm text-slate-500">
        Each entity can have its own fiscal year-end and base currency.
      </p>

      <div className="mt-6 space-y-4">
        {entities.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No entities yet. Create one to configure its fiscal settings.
          </p>
        ) : (
          entities.map((e) => (
            <form
              key={e.id}
              action={updateEntityFiscal}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <input type="hidden" name="tenantSlug" value={params.tenant} />
              <input type="hidden" name="entityId" value={e.id} />

              <h2 className="text-sm font-semibold text-slate-900">{e.name}</h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Fiscal year-end (MM-DD)
                  </label>
                  <input
                    type="text"
                    name="fiscalYearEnd"
                    defaultValue={e.fiscalYearEnd ?? "12-31"}
                    placeholder="12-31"
                    pattern="\d{2}-\d{2}"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">Calendar year = 12-31</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Base currency
                  </label>
                  <select
                    name="baseCurrency"
                    defaultValue={e.baseCurrency}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Save
                </button>
              </div>
            </form>
          ))
        )}
      </div>
    </div>
  );
}
