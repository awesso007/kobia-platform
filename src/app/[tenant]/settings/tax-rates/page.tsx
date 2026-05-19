import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import {
  createTaxRateAction,
  deleteTaxRateAction,
  setDefaultTaxRateAction,
  toggleTaxRateAction,
} from "@/app/actions/tax-rate-actions";

export const dynamic = "force-dynamic";

export default async function TaxRatesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const rates = await db.taxRate.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/settings`} className="hover:text-slate-700">
          ← Settings
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Sales Tax Rates</h1>
      <p className="mt-1 text-sm text-slate-500">
        Configure the tax rates this entity charges on invoices.
      </p>

      <form
        action={createTaxRateAction}
        className="mt-6 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <p className="mb-3 text-sm font-medium text-slate-700">Add a rate</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="md:col-span-2 text-xs text-slate-600">
            Name
            <input
              type="text"
              name="name"
              required
              placeholder="CA Sales Tax"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Jurisdiction
            <input
              type="text"
              name="jurisdiction"
              placeholder="CA"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Rate (%)
            <input
              type="number"
              name="ratePct"
              step="0.001"
              min="0"
              max="100"
              required
              placeholder="7.25"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="isDefault" value="1" className="rounded border-slate-300" />
            Set as default
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add rate
          </button>
        </div>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Jurisdiction</th>
              <th className="px-4 py-2 text-right font-medium">Rate</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rates.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No tax rates yet. Add your first one above.
                </td>
              </tr>
            ) : (
              rates.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{r.name}</span>
                      {r.isDefault && (
                        <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.jurisdiction ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {(r.rateBps / 100).toFixed(3)}%
                  </td>
                  <td className="px-4 py-2">
                    {r.isActive ? (
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {!r.isDefault && r.isActive && (
                        <form action={setDefaultTaxRateAction}>
                          <input type="hidden" name="tenantSlug" value={params.tenant} />
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-blue-200 bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Set default
                          </button>
                        </form>
                      )}
                      <form action={toggleTaxRateAction}>
                        <input type="hidden" name="tenantSlug" value={params.tenant} />
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          {r.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <form action={deleteTaxRateAction}>
                        <input type="hidden" name="tenantSlug" value={params.tenant} />
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Rates are stored per entity. When invoice tax wiring lands, select the appropriate rate on
        each invoice — the default rate is suggested automatically.
      </p>
    </div>
  );
}
