import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { getF940ForYear } from "@/lib/accounting/year-end-forms";
import { PrintButton } from "../PrintButton";

export const dynamic = "force-dynamic";

export default async function F940Page({
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
  const f940 = await getF940ForYear({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    year,
  });

  const Row = ({ line, label, value }: { line: string; label: string; value: bigint | number }) => (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{line}</td>
      <td className="px-3 py-2 text-sm">{label}</td>
      <td className="px-3 py-2 text-right text-sm tabular-nums">
        {typeof value === "bigint" ? formatCents(value) : value}
      </td>
    </tr>
  );

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
        <Link href={`/${params.tenant}/payroll/forms`} className="hover:text-slate-700">
          ← Forms
        </Link>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <input
              type="number"
              name="year"
              defaultValue={year}
              min={2020}
              max={2100}
              className="w-24 rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
            <button className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white">
              Load
            </button>
          </form>
          <PrintButton />
        </div>
      </div>

      <div className="rounded-lg border border-slate-300 bg-white p-6">
        <div className="border-b border-slate-300 pb-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Form 940 — Employer&apos;s Annual Federal Unemployment (FUTA) Tax Return
          </p>
          <h1 className="text-xl font-bold text-slate-900">
            {entity.name} — {year}
          </h1>
        </div>

        <table className="mt-4 w-full">
          <tbody>
            <Row line="—" label="Employees with posted payroll" value={f940.employeeCount} />
            <Row line="3" label="Total payments to all employees" value={f940.totalWagesCents} />
            <Row line="7" label="FUTA taxable wages (first $7,000 per employee)" value={f940.futaWagesCents} />
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
              <td className="px-3 py-2 text-xs text-slate-500">14</td>
              <td className="px-3 py-2 text-sm">FUTA tax (0.6% × line 7)</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">
                {formatCents(f940.futaTaxCents)}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4 text-[10px] text-slate-400">
          Computed at the standard 0.6% effective rate (6.0% statutory − 5.4% state credit). State
          unemployment reporting is handled separately and is not included.
        </p>
      </div>
    </div>
  );
}
