import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { getActiveEntity } from "@/lib/active-entity";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  BANK_FEED: "Bank feed",
  INVOICE: "Invoice",
  BILL: "Bill",
  PAYMENT: "Payment",
  PAYROLL: "Payroll",
  ADJUSTMENT: "Adjustment",
  OPENING_BALANCE: "Opening balance",
  AI_SUGGESTED: "AI suggested",
  IMPORT: "Import",
  DEPRECIATION: "Depreciation",
  ASSET_PURCHASE: "Asset purchase",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  POSTED: "bg-emerald-100 text-emerald-800",
  REVERSED: "bg-amber-100 text-amber-800",
  VOID: "bg-rose-100 text-rose-800",
};

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { source?: string; status?: string; days?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const days = Math.max(1, Math.min(365, Number(searchParams.days ?? 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sourceFilter = searchParams.source && searchParams.source !== "ALL"
    ? { source: searchParams.source as
        | "MANUAL"
        | "BANK_FEED"
        | "INVOICE"
        | "BILL"
        | "PAYMENT"
        | "PAYROLL"
        | "ADJUSTMENT"
        | "OPENING_BALANCE"
        | "AI_SUGGESTED"
        | "IMPORT"
        | "DEPRECIATION"
        | "ASSET_PURCHASE" }
    : {};
  const statusFilter = searchParams.status && searchParams.status !== "ALL"
    ? { status: searchParams.status as "DRAFT" | "POSTED" | "REVERSED" | "VOID" }
    : {};

  const entries = await db.journalEntry.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      OR: [
        { postedAt: { gte: since } },
        { createdAt: { gte: since } },
        { updatedAt: { gte: since } },
      ],
      ...sourceFilter,
      ...statusFilter,
    },
    include: {
      lines: { select: { debitCents: true, creditCents: true } },
    },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  // Look up posting users
  const userIds = Array.from(
    new Set(entries.map((e) => e.postedByUserId).filter(Boolean) as string[])
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Summary
  const postedCount = entries.filter((e) => e.status === "POSTED").length;
  const reversedCount = entries.filter((e) => e.status === "REVERSED").length;
  const voidCount = entries.filter((e) => e.status === "VOID").length;
  const draftCount = entries.filter((e) => e.status === "DRAFT").length;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/books`}
          className="hover:text-slate-700"
        >
          ← Back to books
        </Link>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Audit Log
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Every accounting event in the books — posted, reversed, voided, and
        draft journal entries. Last {days} days, latest 500.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Posted" value={postedCount} tone="emerald" />
        <SummaryCard label="Reversed" value={reversedCount} tone="amber" />
        <SummaryCard label="Void" value={voidCount} tone="rose" />
        <SummaryCard label="Draft" value={draftCount} tone="slate" />
      </div>

      <form
        method="GET"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Source
          </span>
          <select
            name="source"
            defaultValue={searchParams.source ?? "ALL"}
            className="mt-1 block rounded-md border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="ALL">All sources</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Status
          </span>
          <select
            name="status"
            defaultValue={searchParams.status ?? "ALL"}
            className="mt-1 block rounded-md border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="POSTED">Posted</option>
            <option value="DRAFT">Draft</option>
            <option value="REVERSED">Reversed</option>
            <option value="VOID">Void</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Last N days
          </span>
          <input
            name="days"
            type="number"
            min="1"
            max="365"
            defaultValue={days}
            className="mt-1 block w-24 rounded-md border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Filter
        </button>
      </form>

      {entries.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-slate-600">No activity in this window.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">JE #</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">By</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => {
                const total = e.lines.reduce(
                  (sum, l) => sum + l.debitCents,
                  0n
                );
                const u = e.postedByUserId
                  ? userMap.get(e.postedByUserId)
                  : null;
                const when = e.postedAt ?? e.createdAt;
                return (
                  <tr key={e.id} className="text-sm">
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {when.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {e.entryNumber > 0 ? (
                        <Link
                          href={`/${params.tenant}/books/journal/${e.id}`}
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          #{e.entryNumber}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {SOURCE_LABEL[e.source] ?? e.source}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {e.description ?? (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                      {formatCents(total)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {u ? ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.email) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[e.status] ?? "bg-slate-100"
                        }`}
                      >
                        {e.status}
                      </span>
                      {e.periodLocked ? (
                        <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">
                          locked
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Immutable record — once a journal entry is posted, it can only be
        reversed (not edited). Period locks prevent any new activity in a closed
        month.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  }[tone];
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
