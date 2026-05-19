import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { createPayRunAction } from "@/app/actions/payrun-actions";

export const dynamic = "force-dynamic";

export default async function PayRunsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const runs = await db.payRun.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    orderBy: { payDate: "desc" },
    take: 50,
    include: { _count: { select: { paystubs: true } } },
  });

  const today = new Date();
  // Default suggested period: previous 2 weeks ending Sunday before today
  const periodEnd = new Date(today);
  const periodStart = new Date(today);
  periodStart.setUTCDate(periodEnd.getUTCDate() - 13);
  const payDate = new Date(today);
  payDate.setUTCDate(today.getUTCDate() + 5);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/payroll`} className="hover:text-slate-700">
          ← Payroll
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Pay Runs</h1>
      <p className="mt-1 text-sm text-slate-500">
        {entity.name} · Withholding placeholder rates apply until Cycle 5 W3 ships
      </p>

      <form
        action={createPayRunAction}
        className="mt-6 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <p className="mb-3 text-sm font-medium text-slate-700">Start a pay run</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="md:col-span-1 text-xs text-slate-600">
            Period start
            <input
              type="date"
              name="periodStart"
              required
              defaultValue={periodStart.toISOString().slice(0, 10)}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Period end
            <input
              type="date"
              name="periodEnd"
              required
              defaultValue={periodEnd.toISOString().slice(0, 10)}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Pay date
            <input
              type="date"
              name="payDate"
              required
              defaultValue={payDate.toISOString().slice(0, 10)}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Cadence
            <select
              name="cadence"
              defaultValue="biweekly"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="semimonthly">Semi-monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Default state
            <input
              type="text"
              name="defaultState"
              maxLength={2}
              placeholder="CA"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm uppercase"
            />
            <span className="mt-1 block text-[10px] text-slate-400">
              Used when employee home address has no state
            </span>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Generate paystubs
          </button>
        </div>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Pay date</th>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 text-right font-medium">Paystubs</th>
              <th className="px-4 py-2 text-right font-medium">Gross</th>
              <th className="px-4 py-2 text-right font-medium">Net</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No pay runs yet. Start one above.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">
                    {r.payDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.periodStart.toISOString().slice(0, 10)} →{" "}
                    {r.periodEnd.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {r._count.paystubs}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(r.totalGrossCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(r.totalNetCents)}
                  </td>
                  <td className="px-4 py-2">
                    {r.status === "POSTED" && (
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Posted
                      </span>
                    )}
                    {r.status === "DRAFT" && (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Draft
                      </span>
                    )}
                    {r.status === "VOID" && (
                      <span className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                        Void
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/${params.tenant}/payroll/runs/${r.id}`}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
