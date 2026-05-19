import Link from "next/link";

export default function PayrollIndex({ params }: { params: { tenant: string } }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Payroll</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage employees and run payroll. Tax-withholding engine ships in Cycle 5 W3.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link
          href={`/${params.tenant}/payroll/employees`}
          className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
        >
          <p className="font-medium text-slate-900">Employees</p>
          <p className="mt-1 text-sm text-slate-500">
            Add and manage employees and contractors.
          </p>
        </Link>
        <Link
          href={`/${params.tenant}/payroll/runs`}
          className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
        >
          <p className="font-medium text-slate-900">Pay Runs</p>
          <p className="mt-1 text-sm text-slate-500">
            Generate paystubs and post payroll to the ledger.
          </p>
        </Link>
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
          <p className="font-medium text-slate-500">Tax Engine</p>
          <p className="mt-1 text-sm text-slate-500">
            Real W-4 / state brackets land in Cycle 5 W3.
          </p>
        </div>
      </div>
    </div>
  );
}
