import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

function milliToHours(milli: bigint): string {
  return (Number(milli) / 1000).toFixed(2);
}

export default async function PaystubPage({
  params,
}: {
  params: { tenant: string; payRunId: string; paystubId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const paystub = await db.paystub.findFirst({
    where: {
      id: params.paystubId,
      tenantId: auth.tenant.id,
      payRunId: params.payRunId,
    },
    include: {
      employee: true,
      payRun: true,
    },
  });
  if (!paystub) notFound();
  if (paystub.payRun.entityId !== entity.id) notFound();

  const totalTax =
    paystub.federalTaxCents +
    paystub.stateTaxCents +
    paystub.socialSecurityCents +
    paystub.medicareCents +
    paystub.otherDeductionsCents;

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
        @page { size: letter; margin: 0.5in; }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/payroll/runs/${params.payRunId}`}
          className="hover:text-slate-700"
        >
          ← Pay run
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Pay Stub</p>
            <h1 className="text-2xl font-bold text-slate-900">{entity.name}</h1>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>
              Pay date:{" "}
              <span className="font-medium text-slate-900">
                {paystub.payRun.payDate.toISOString().slice(0, 10)}
              </span>
            </p>
            <p>
              Period:{" "}
              <span className="font-medium text-slate-900">
                {paystub.payRun.periodStart.toISOString().slice(0, 10)} →{" "}
                {paystub.payRun.periodEnd.toISOString().slice(0, 10)}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Employee</p>
            <p className="mt-1 font-medium text-slate-900">
              {paystub.employee.firstName} {paystub.employee.lastName}
            </p>
            {paystub.employee.email && (
              <p className="text-slate-600">{paystub.employee.email}</p>
            )}
            {paystub.employee.ssnLast4 && (
              <p className="text-slate-500 text-xs">
                SSN: •••-••-{paystub.employee.ssnLast4}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Pay type</p>
            <p className="mt-1 font-medium text-slate-900">{paystub.employee.payType}</p>
            <p className="text-slate-600 text-xs">
              Rate: {formatCents(paystub.employee.payRateCents)}
              {paystub.employee.payType === "HOURLY" ? "/hr" : "/yr"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Earnings</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Hours</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2">Regular pay</td>
                <td className="py-2 text-right tabular-nums">
                  {paystub.employee.payType === "HOURLY"
                    ? milliToHours(paystub.regularHoursMilli)
                    : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(paystub.regularPayCents)}
                </td>
              </tr>
              {paystub.overtimePayCents > 0n && (
                <tr className="border-b border-slate-100">
                  <td className="py-2">Overtime (1.5x)</td>
                  <td className="py-2 text-right tabular-nums">
                    {milliToHours(paystub.overtimeHoursMilli)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCents(paystub.overtimePayCents)}
                  </td>
                </tr>
              )}
              {paystub.bonusCents > 0n && (
                <tr className="border-b border-slate-100">
                  <td className="py-2">Bonus</td>
                  <td className="py-2 text-right">—</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCents(paystub.bonusCents)}
                  </td>
                </tr>
              )}
              <tr className="font-medium">
                <td className="py-2">Gross pay</td>
                <td></td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(paystub.grossCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Withholdings</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2">Federal income tax</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(paystub.federalTaxCents)}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2">State income tax</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(paystub.stateTaxCents)}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2">Social Security</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(paystub.socialSecurityCents)}
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2">Medicare</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(paystub.medicareCents)}
                </td>
              </tr>
              {paystub.otherDeductionsCents > 0n && (
                <tr className="border-b border-slate-100">
                  <td className="py-2">Other deductions</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCents(paystub.otherDeductionsCents)}
                  </td>
                </tr>
              )}
              <tr className="font-medium">
                <td className="py-2">Total withholdings</td>
                <td className="py-2 text-right tabular-nums">{formatCents(totalTax)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-md bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-700">Net pay</p>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">
            {formatCents(paystub.netCents)}
          </p>
        </div>

        <p className="mt-6 text-[10px] text-slate-400">
          Withholdings shown reflect placeholder rates pending the production tax engine. Final
          year-end W-2 totals will be reconciled before filing.
        </p>
      </div>
    </div>
  );
}
