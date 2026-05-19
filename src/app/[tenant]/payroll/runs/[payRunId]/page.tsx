import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  postPayRunAction,
  voidPayRunAction,
} from "@/app/actions/payrun-actions";

export const dynamic = "force-dynamic";

function milliToHours(milli: bigint): string {
  return (Number(milli) / 1000).toFixed(2);
}

export default async function PayRunDetailPage({
  params,
}: {
  params: { tenant: string; payRunId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const pr = await db.payRun.findFirst({
    where: { id: params.payRunId, tenantId: auth.tenant.id, entityId: entity.id },
    include: {
      paystubs: {
        include: { employee: true },
        orderBy: { employee: { lastName: "asc" } },
      },
    },
  });
  if (!pr) notFound();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/payroll/runs`} className="hover:text-slate-700">
          ← Pay runs
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Pay run · {pr.payDate.toISOString().slice(0, 10)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {pr.periodStart.toISOString().slice(0, 10)} → {pr.periodEnd.toISOString().slice(0, 10)} ·{" "}
            {pr.paystubs.length} paystub{pr.paystubs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pr.status === "DRAFT" && pr.paystubs.length > 0 && (
            <form action={postPayRunAction}>
              <input type="hidden" name="tenantSlug" value={params.tenant} />
              <input type="hidden" name="payRunId" value={pr.id} />
              <button
                type="submit"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Post pay run
              </button>
            </form>
          )}
          {pr.status === "DRAFT" && (
            <form action={voidPayRunAction}>
              <input type="hidden" name="tenantSlug" value={params.tenant} />
              <input type="hidden" name="payRunId" value={pr.id} />
              <button
                type="submit"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Void
              </button>
            </form>
          )}
          {pr.status === "POSTED" && (
            <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Posted · {pr.postedAt?.toISOString().slice(0, 10)}
            </span>
          )}
          {pr.status === "VOID" && (
            <span className="inline-block rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
              Voided
            </span>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="Total gross" value={formatCents(pr.totalGrossCents)} />
        <Card label="Withholdings" value={formatCents(pr.totalTaxesCents)} />
        <Card label="Net pay" value={formatCents(pr.totalNetCents)} accent />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 text-right font-medium">Reg hrs</th>
              <th className="px-4 py-2 text-right font-medium">OT hrs</th>
              <th className="px-4 py-2 text-right font-medium">Gross</th>
              <th className="px-4 py-2 text-right font-medium">Fed</th>
              <th className="px-4 py-2 text-right font-medium">State</th>
              <th className="px-4 py-2 text-right font-medium">FICA</th>
              <th className="px-4 py-2 text-right font-medium">Net</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pr.paystubs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No paystubs in this run. Add time entries or salaried employees and start a new run.
                </td>
              </tr>
            ) : (
              pr.paystubs.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {p.employee.firstName} {p.employee.lastName}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {milliToHours(p.regularHoursMilli)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {milliToHours(p.overtimeHoursMilli)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(p.grossCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {formatCents(p.federalTaxCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {formatCents(p.stateTaxCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {formatCents(p.socialSecurityCents + p.medicareCents)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatCents(p.netCents)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/${params.tenant}/payroll/runs/${pr.id}/paystubs/${p.id}`}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Paystub →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Withholdings shown use placeholder rates (Fed 12% / State 4% / SS 6.2% / Medicare 1.45%).
        The real tax engine with W-4 brackets, state-specific rules, and SUTA / FUTA ships in
        Cycle 5 W3.
      </p>
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
