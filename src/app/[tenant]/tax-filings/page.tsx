import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createTaxFiling,
  markTaxFilingFiled,
  updateTaxFilingStatus,
  deleteTaxFiling,
} from "@/app/actions/tax-filing-actions";

export const dynamic = "force-dynamic";

const FILING_TYPES = [
  "FORM_941",
  "FORM_940",
  "FORM_W2",
  "FORM_1099_NEC",
  "FORM_1099_MISC",
  "SALES_TAX",
  "STATE_INCOME",
  "FEDERAL_INCOME",
  "STATE_PAYROLL",
  "PROPERTY_TAX",
  "EXCISE",
  "OTHER",
] as const;

const TYPE_LABEL: Record<string, string> = {
  FORM_941: "Form 941",
  FORM_940: "Form 940",
  FORM_W2: "W-2",
  FORM_1099_NEC: "1099-NEC",
  FORM_1099_MISC: "1099-MISC",
  SALES_TAX: "Sales Tax",
  STATE_INCOME: "State Income",
  FEDERAL_INCOME: "Federal Income",
  STATE_PAYROLL: "State Payroll",
  PROPERTY_TAX: "Property Tax",
  EXCISE: "Excise",
  OTHER: "Other",
};

const STATUSES = ["UPCOMING", "IN_PROGRESS", "FILED", "LATE", "EXTENDED", "N_A"] as const;
const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Upcoming",
  IN_PROGRESS: "In progress",
  FILED: "Filed",
  LATE: "Late",
  EXTENDED: "Extended",
  N_A: "N/A",
};
const STATUS_TINT: Record<string, string> = {
  UPCOMING: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  FILED: "bg-emerald-50 text-emerald-700",
  LATE: "bg-rose-50 text-rose-700",
  EXTENDED: "bg-amber-50 text-amber-700",
  N_A: "bg-slate-50 text-slate-500",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function fmtMoney(cents: bigint | null): string {
  if (cents === null || cents === undefined) return "—";
  return (Number(cents) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function daysUntil(d: Date): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export default async function TaxFilingsPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { status?: string; entityId?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  const { tenant } = auth;

  const [entities, filings] = await Promise.all([
    db.entity
      .findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" }, take: 200 })
      .catch(() => []),
    db.taxFiling
      .findMany({
        where: {
          tenantId: tenant.id,
          ...(searchParams?.status
            ? { status: searchParams.status as (typeof STATUSES)[number] }
            : {}),
          ...(searchParams?.entityId
            ? { entityId: searchParams.entityId }
            : {}),
        },
        orderBy: { dueDate: "asc" },
        take: 500,
      })
      .catch(() => []),
  ]);

  const entityMap = new Map(entities.map((e) => [e.id, e.name]));

  // Auto-flag late ones (display only — actual status update is a manual action)
  const now = Date.now();
  const upcomingCount = filings.filter(
    (f) =>
      (f.status === "UPCOMING" || f.status === "IN_PROGRESS") &&
      new Date(f.dueDate).getTime() >= now,
  ).length;
  const lateCount = filings.filter(
    (f) =>
      (f.status === "UPCOMING" || f.status === "IN_PROGRESS") &&
      new Date(f.dueDate).getTime() < now,
  ).length;
  const filedThisYear = filings.filter(
    (f) =>
      f.status === "FILED" &&
      f.filedAt &&
      new Date(f.filedAt).getFullYear() === new Date().getFullYear(),
  ).length;

  return (
    <div className="px-6 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Tax Filings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track every filing deadline — federal, state, sales tax, 1099s.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Upcoming" value={upcomingCount} />
        <KpiCard label="Overdue" value={lateCount} tone={lateCount > 0 ? "danger" : undefined} />
        <KpiCard label="Filed this year" value={filedThisYear} />
      </div>

      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          Add a filing
        </summary>
        <form
          action={createTaxFiling.bind(null, params.tenant)}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">Filing type</label>
            <select
              name="filingType"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {FILING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Period</label>
            <input
              name="periodLabel"
              required
              placeholder="e.g., Q1 2026"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Due date</label>
            <input
              name="dueDate"
              required
              type="date"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Jurisdiction</label>
            <input
              name="jurisdiction"
              placeholder="IRS, CA-FTB, CA-CDTFA"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Client business (optional)
            </label>
            <select
              name="entityId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Amount (optional)
            </label>
            <input
              name="amount"
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-600">Notes</label>
            <textarea
              name="notes"
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3 text-right">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Add filing
            </button>
          </div>
        </form>
      </details>

      <div className="mt-6">
        <form className="flex flex-wrap items-center gap-2">
          <select
            name="status"
            defaultValue={searchParams?.status ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            name="entityId"
            defaultValue={searchParams?.entityId ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All client businesses</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Filter
          </button>
          {(searchParams?.status || searchParams?.entityId) && (
            <Link
              href={`/${params.tenant}/tax-filings`}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="mt-6">
        {filings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No filings tracked yet. Add a filing above to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Form</th>
                  <th className="px-4 py-2">Period</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filings.map((f) => {
                  const days = daysUntil(f.dueDate);
                  const isOverdue =
                    (f.status === "UPCOMING" || f.status === "IN_PROGRESS") &&
                    days < 0;
                  return (
                    <tr key={f.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium">
                          {TYPE_LABEL[f.filingType] ?? f.filingType}
                        </div>
                        {f.jurisdiction ? (
                          <div className="text-xs text-slate-500">
                            {f.jurisdiction}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{f.periodLabel}</td>
                      <td className="px-4 py-2 text-slate-700">
                        {fmtDate(f.dueDate)}
                        <div className="text-xs">
                          {isOverdue ? (
                            <span className="text-rose-600 font-medium">
                              {Math.abs(days)}d overdue
                            </span>
                          ) : f.status === "FILED" ? (
                            <span className="text-emerald-600">
                              Filed {fmtDate(f.filedAt)}
                            </span>
                          ) : days <= 30 ? (
                            <span className="text-amber-600 font-medium">
                              in {days}d
                            </span>
                          ) : (
                            <span className="text-slate-400">in {days}d</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {f.entityId ? entityMap.get(f.entityId) ?? "—" : "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {fmtMoney(f.amountCents)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TINT[f.status] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {STATUS_LABEL[f.status]}
                        </span>
                        {f.confirmationNo ? (
                          <div className="mt-1 text-xs text-slate-500">
                            Conf: {f.confirmationNo}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {f.status !== "FILED" ? (
                          <form
                            action={markTaxFilingFiled.bind(null, params.tenant)}
                            className="inline"
                          >
                            <input type="hidden" name="id" value={f.id} />
                            <input
                              name="confirmationNo"
                              placeholder="Conf #"
                              className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                            />
                            <button
                              type="submit"
                              className="ml-1 rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                            >
                              Mark filed
                            </button>
                          </form>
                        ) : null}
                        <form
                          action={updateTaxFilingStatus.bind(null, params.tenant)}
                          className="ml-2 inline"
                        >
                          <input type="hidden" name="id" value={f.id} />
                          <select
                            name="status"
                            defaultValue={f.status}
                            className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="ml-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Update
                          </button>
                        </form>
                        <form
                          action={deleteTaxFiling.bind(null, params.tenant)}
                          className="ml-2 inline"
                        >
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "danger"
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`text-xs font-medium uppercase tracking-wide ${
          tone === "danger" ? "text-rose-700" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          tone === "danger" ? "text-rose-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
