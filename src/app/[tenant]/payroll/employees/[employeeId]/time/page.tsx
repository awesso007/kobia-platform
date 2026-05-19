import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  createTimeEntryAction,
  deleteTimeEntryAction,
} from "@/app/actions/time-entry-actions";

export const dynamic = "force-dynamic";

function milliToHours(milli: bigint): number {
  return Number(milli) / 1000;
}

export default async function EmployeeTimePage({
  params,
}: {
  params: { tenant: string; employeeId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const employee = await db.employee.findFirst({
    where: { id: params.employeeId, tenantId: auth.tenant.id, entityId: entity.id },
  });
  if (!employee) notFound();

  // last 60 days
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 60);

  const entries = await db.timeEntry.findMany({
    where: { tenantId: auth.tenant.id, employeeId: employee.id, workDate: { gte: since } },
    orderBy: { workDate: "desc" },
  });

  const totalHours = entries.reduce((s, e) => s + milliToHours(e.hoursMilli), 0);
  const otHours = entries
    .filter((e) => e.isOvertime)
    .reduce((s, e) => s + milliToHours(e.hoursMilli), 0);
  const regularHours = totalHours - otHours;

  // Estimated gross for hourly employees
  const estGrossCents = (() => {
    if (employee.payType !== "HOURLY") return null;
    const rate = Number(employee.payRateCents); // hourly cents
    const reg = regularHours * rate;
    const ot = otHours * rate * 1.5;
    return BigInt(Math.round(reg + ot));
  })();

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/payroll/employees`} className="hover:text-slate-700">
          ← Employees
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">
        Time for {employee.firstName} {employee.lastName}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Last 60 days · {employee.payType}
        {employee.payType === "HOURLY" && (
          <>
            {" · "}
            {formatCents(employee.payRateCents)}/hr
          </>
        )}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card label="Total hours" value={totalHours.toFixed(2)} />
        <Card label="Regular" value={regularHours.toFixed(2)} />
        <Card label="Overtime" value={otHours.toFixed(2)} />
        <Card
          label="Est. gross (60d)"
          value={estGrossCents !== null ? formatCents(estGrossCents) : "—"}
          accent
        />
      </div>

      <form
        action={createTimeEntryAction}
        className="mt-6 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <input type="hidden" name="employeeId" value={employee.id} />
        <p className="mb-3 text-sm font-medium text-slate-700">Log time</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="md:col-span-1 text-xs text-slate-600">
            Date
            <input
              type="date"
              name="workDate"
              required
              defaultValue={todayISO}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Hours
            <input
              type="number"
              name="hours"
              step="0.25"
              min="0"
              required
              placeholder="8"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Overtime?
            <select
              name="isOvertime"
              defaultValue="0"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="0">Regular</option>
              <option value="1">Overtime (1.5x)</option>
            </select>
          </label>
          <label className="md:col-span-2 text-xs text-slate-600">
            Notes
            <input
              type="text"
              name="notes"
              placeholder="Project, location, etc."
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Add entry
          </button>
        </div>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 text-right font-medium">Hours</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Notes</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No time entries yet. Log a day above.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">
                    {e.workDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {milliToHours(e.hoursMilli).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {e.isOvertime ? (
                      <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        OT
                      </span>
                    ) : (
                      <span className="text-slate-500">Regular</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{e.notes ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">
                    {e.paystubId ? "On paystub" : "Unbilled"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!e.paystubId && (
                      <form action={deleteTimeEntryAction}>
                        <input type="hidden" name="tenantSlug" value={params.tenant} />
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-rose-200 bg-white px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </form>
                    )}
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
