import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import { getF941ForQuarter } from "@/lib/accounting/year-end-forms";
import { PrintButton } from "../PrintButton";

export const dynamic = "force-dynamic";

export default async function F941Page({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { year?: string; quarter?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const qRaw = Number(searchParams.quarter) || Math.floor(now.getUTCMonth() / 3) + 1;
  const quarter = (Math.min(4, Math.max(1, qRaw)) as 1 | 2 | 3 | 4);

  const f941 = await getF941ForQuarter({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    year,
    quarter,
  });

  const Row = ({ line, label, value, indent = false }: { line: string; label: string; value: bigint | string | number; indent?: boolean }) => (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{line}</td>
      <td className={`px-3 py-2 text-sm ${indent ? "pl-8" : ""}`}>{label}</td>
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
              className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
            <select
              name="quarter"
              defaultValue={quarter}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            >
              <option value={1}>Q1</option>
              <option value={2}>Q2</option>
              <option value={3}>Q3</option>
              <option value={4}>Q4</option>
            </select>
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
            Form 941 — Employer&apos;s Quarterly Federal Tax Return
          </p>
          <h1 className="text-xl font-bold text-slate-900">
            {entity.name} — Q{quarter} {year}
          </h1>
        </div>

        <table className="mt-4 w-full">
          <tbody>
            <Row line="1" label="Number of employees who received wages" value={f941.employeeCount} />
            <Row line="2" label="Wages, tips, and other compensation" value={f941.wagesCents} />
            <Row line="3" label="Federal income tax withheld from wages, tips, and other compensation" value={f941.federalTaxCents} />
            <Row line="5a" label="Taxable Social Security wages" value={f941.ssWagesCents} />
            <Row line="5a (tax)" label="× 12.4% = Social Security tax (employee + employer)" value={f941.ssTaxCents} indent />
            <Row line="5c" label="Taxable Medicare wages and tips" value={f941.medicareWagesCents} />
            <Row line="5c (tax)" label="× 2.9% = Medicare tax (employee + employer)" value={f941.medicareTaxCents} indent />
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
              <td className="px-3 py-2 text-xs text-slate-500">12</td>
              <td className="px-3 py-2 text-sm">Total taxes after adjustments and credits</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">
                {formatCents(f941.totalLiabilityCents)}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4 text-[10px] text-slate-400">
          Computed from posted paystubs in {new Date(Date.UTC(year, (quarter - 1) * 3, 1)).toISOString().slice(0, 10)} →{" "}
          {new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10)}. Use as a worksheet
          before filing official Form 941 with the IRS.
        </p>
      </div>
    </div>
  );
}
