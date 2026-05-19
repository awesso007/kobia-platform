import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  createEmployeeAction,
  toggleEmployeeAction,
} from "@/app/actions/employee-actions";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const employees = await db.employee.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  const active = employees.filter((e) => e.isActive);
  const inactive = employees.filter((e) => !e.isActive);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/payroll`} className="hover:text-slate-700">
          ← Payroll
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
      <p className="mt-1 text-sm text-slate-500">
        {entity.name} · {active.length} active · {inactive.length} inactive
      </p>

      <form
        action={createEmployeeAction}
        className="mt-6 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <p className="mb-3 text-sm font-medium text-slate-700">Add an employee</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="md:col-span-1 text-xs text-slate-600">
            First name
            <input
              type="text"
              name="firstName"
              required
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Last name
            <input
              type="text"
              name="lastName"
              required
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-2 text-xs text-slate-600">
            Email
            <input
              type="email"
              name="email"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Pay type
            <select
              name="payType"
              defaultValue="SALARY"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="SALARY">Salary</option>
              <option value="HOURLY">Hourly</option>
              <option value="CONTRACTOR">Contractor (1099)</option>
            </select>
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Pay rate ($)
            <input
              type="number"
              name="payRate"
              step="0.01"
              min="0"
              required
              placeholder="60000 or 25.00"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Std hrs/period
            <input
              type="number"
              name="standardHoursPerPeriod"
              step="0.5"
              min="0"
              placeholder="80"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Hire date
            <input
              type="date"
              name="hireDate"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            SSN (last 4)
            <input
              type="text"
              name="ssnLast4"
              maxLength={4}
              pattern="\d{0,4}"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add employee
          </button>
        </div>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Pay Rate</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No employees yet. Add your first hire above.
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {e.firstName} {e.lastName}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{e.email ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{e.payType}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(e.payRateCents)}
                    <span className="ml-1 text-xs text-slate-400">
                      {e.payType === "HOURLY" ? "/hr" : e.payType === "SALARY" ? "/yr" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {e.isActive ? (
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
                      <Link
                        href={`/${params.tenant}/payroll/employees/${e.id}/time`}
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Time →
                      </Link>
                      <form action={toggleEmployeeAction}>
                        <input type="hidden" name="tenantSlug" value={params.tenant} />
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          {e.isActive ? "Terminate" : "Reactivate"}
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
        SSNs are stored as last 4 only. Full SSN handling will route through a dedicated secrets
        provider before payroll filing ships.
      </p>
    </div>
  );
}
