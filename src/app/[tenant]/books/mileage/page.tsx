import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  createMileageAction,
  postMileageAction,
  voidMileageAction,
} from "@/app/actions/mileage-actions";

export const dynamic = "force-dynamic";

export default async function MileagePage({
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

  const now = new Date();
  const year = Number(searchParams.year ?? now.getUTCFullYear());
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const entries = await db.mileage.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      tripDate: { gte: yearStart, lt: yearEnd },
    },
    orderBy: { tripDate: "desc" },
    take: 200,
  });

  const totals = entries.reduce(
    (acc, m) => {
      if (m.status === "VOID") return acc;
      acc.miles += Number(m.miles);
      acc.expense += m.expenseCents;
      acc.count += 1;
      if (m.status === "POSTED") acc.posted += 1;
      return acc;
    },
    { miles: 0, expense: 0n, count: 0, posted: 0 },
  );

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-700">
          ← Back to books
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mileage</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · {year} · IRS standard rate 70¢/mile
          </p>
        </div>
        <form className="flex items-center gap-2 text-sm">
          <label className="text-slate-600">Year</label>
          <select
            name="year"
            defaultValue={year}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {[year + 1, year, year - 1, year - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card label="Trips" value={`${totals.count}`} />
        <Card label="Miles" value={totals.miles.toFixed(2)} />
        <Card label="Posted" value={`${totals.posted}`} />
        <Card label="Deductible" value={formatCents(totals.expense)} accent />
      </div>

      {/* Quick add */}
      <form
        action={createMileageAction}
        className="mb-8 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <p className="mb-3 text-sm font-medium text-slate-700">Log a trip</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="md:col-span-1 text-xs text-slate-600">
            Date
            <input
              type="date"
              name="tripDate"
              required
              defaultValue={todayISO}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Miles
            <input
              type="number"
              name="miles"
              step="0.1"
              min="0"
              required
              placeholder="12.5"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Rate (¢/mi)
            <input
              type="number"
              name="ratePerMileCents"
              defaultValue={70}
              min="0"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            Business %
            <input
              type="number"
              name="businessPercent"
              defaultValue={100}
              min="0"
              max="100"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            From
            <input
              type="text"
              name="fromAddress"
              placeholder="Home"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-1 text-xs text-slate-600">
            To
            <input
              type="text"
              name="toAddress"
              placeholder="Client site"
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="md:col-span-6 text-xs text-slate-600">
            Purpose
            <input
              type="text"
              name="purpose"
              placeholder="Client meeting, errand, etc."
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="submit"
            name="andPost"
            value="0"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Save as draft
          </button>
          <button
            type="submit"
            name="andPost"
            value="1"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Save & post
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Trip</th>
              <th className="px-4 py-2 font-medium">Purpose</th>
              <th className="px-4 py-2 text-right font-medium">Miles</th>
              <th className="px-4 py-2 text-right font-medium">Rate</th>
              <th className="px-4 py-2 text-right font-medium">Bus %</th>
              <th className="px-4 py-2 text-right font-medium">Deductible</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No mileage entries yet. Log your first trip above.
                </td>
              </tr>
            ) : (
              entries.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">
                    {m.tripDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {m.fromAddress || m.toAddress
                      ? `${m.fromAddress ?? "—"} → ${m.toAddress ?? "—"}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{m.purpose ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.miles.toString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {m.ratePerMileCents}¢
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {m.businessPercent}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCents(m.expenseCents)}
                  </td>
                  <td className="px-4 py-2">
                    {m.status === "POSTED" && (
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Posted
                      </span>
                    )}
                    {m.status === "DRAFT" && (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Draft
                      </span>
                    )}
                    {m.status === "VOID" && (
                      <span className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                        Void
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {m.status === "DRAFT" && (
                      <div className="flex justify-end gap-1">
                        <form action={postMileageAction}>
                          <input type="hidden" name="tenantSlug" value={params.tenant} />
                          <input type="hidden" name="mileageId" value={m.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Post
                          </button>
                        </form>
                        <form action={voidMileageAction}>
                          <input type="hidden" name="tenantSlug" value={params.tenant} />
                          <input type="hidden" name="mileageId" value={m.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Void
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Posted trips create a journal entry: DR Auto & Mileage Expense / CR Owner
        Contributions. Adjust the rate per entry if your tax year uses a different IRS standard.
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
