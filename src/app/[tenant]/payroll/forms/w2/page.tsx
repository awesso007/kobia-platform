import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { listW2sForYear } from "@/lib/accounting/year-end-forms";

export const dynamic = "force-dynamic";

export default async function W2List({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { year?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const year = Number(searchParams.year) || new Date().getUTCFullYear() - 1;
  const w2s = await listW2sForYear({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    year,
  });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/payroll/forms`}
          className="hover:text-slate-700"
        >
          ← Forms
        </Link>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">W-2 — {year}</h1>
          <p className="mt-1 text-sm text-slate-500">
            One per employee. Click to view and print.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Year</label>
          <input
            type="number"
            name="year"
            defaultValue={year}
            min={2020}
            max={2100}
            className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
          />
          <button className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
            Load
          </button>
        </form>
      </div>

      {w2s.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No posted payroll found for {year}.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 text-right font-medium">Wages (Box 1)</th>
                <th className="px-4 py-2 text-right font-medium">Fed Tax (Box 2)</th>
                <th className="px-4 py-2 text-right font-medium">SS Tax (Box 4)</th>
                <th className="px-4 py-2 text-right font-medium">Medicare (Box 6)</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {w2s.map((w) => (
                <tr key={w.employeeId} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-900">
                    {w.firstName} {w.lastName}
                    {w.ssnLast4 && (
                      <span className="ml-2 text-xs text-slate-400">•••-••-{w.ssnLast4}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(w.totals.wagesCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(w.totals.federalTaxCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(w.totals.ssTaxCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(w.totals.medicareTaxCents)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/${params.tenant}/payroll/forms/w2/${w.employeeId}?year=${year}`}
                      className="text-xs font-medium text-slate-700 hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
