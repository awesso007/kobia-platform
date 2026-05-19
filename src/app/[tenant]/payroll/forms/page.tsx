import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";

export const dynamic = "force-dynamic";

export default async function FormsHub({ params }: { params: { tenant: string } }) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const thisYear = new Date().getUTCFullYear();
  const lastYear = thisYear - 1;
  const thisQuarter = (Math.floor(new Date().getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/payroll`} className="hover:text-slate-700">
          ← Payroll
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Year-End & Quarterly Forms</h1>
      <p className="mt-1 text-sm text-slate-500">
        Generate printable W-2, Form 941, and Form 940 reports from posted payroll.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link
          href={`/${params.tenant}/payroll/forms/w2?year=${lastYear}`}
          className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
        >
          <p className="font-medium text-slate-900">W-2 (Wage &amp; Tax Statement)</p>
          <p className="mt-1 text-sm text-slate-500">
            Per-employee annual wages, withholdings, and Social Security totals.
          </p>
          <p className="mt-2 text-xs text-slate-400">Default year: {lastYear}</p>
        </Link>

        <Link
          href={`/${params.tenant}/payroll/forms/941?year=${thisYear}&quarter=${thisQuarter}`}
          className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
        >
          <p className="font-medium text-slate-900">Form 941 (Quarterly Federal Return)</p>
          <p className="mt-1 text-sm text-slate-500">
            Quarterly federal income tax, Social Security, and Medicare summary.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Current quarter: Q{thisQuarter} {thisYear}
          </p>
        </Link>

        <Link
          href={`/${params.tenant}/payroll/forms/940?year=${lastYear}`}
          className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
        >
          <p className="font-medium text-slate-900">Form 940 (Annual FUTA)</p>
          <p className="mt-1 text-sm text-slate-500">
            Annual federal unemployment tax — 0.6% on first $7,000 per employee.
          </p>
          <p className="mt-2 text-xs text-slate-400">Default year: {lastYear}</p>
        </Link>
      </div>
    </div>
  );
}
