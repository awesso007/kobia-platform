import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { totalPostedFor } from "@/lib/accounting/depreciation";
import { postBulkDepreciationAction } from "@/app/actions/fixed-asset-actions";

export const dynamic = "force-dynamic";

export default async function FixedAssetsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fixed Assets</h1>
        <p className="mt-2 text-sm text-slate-600">Select an entity first.</p>
      </div>
    );
  }

  const assets = await db.fixedAsset.findMany({
    where: { entityId: entity.id },
    orderBy: [{ status: "asc" }, { acquisitionDate: "desc" }],
  });

  // Compute book value for each
  const enriched = await Promise.all(
    assets.map(async (a) => {
      const accumulated = await totalPostedFor(a.id);
      const bookValue = a.costCents - accumulated;
      return { ...a, accumulatedCents: accumulated, bookValueCents: bookValue };
    })
  );

  const totals = enriched.reduce(
    (acc, a) => {
      acc.cost += a.costCents;
      acc.accumulated += a.accumulatedCents;
      acc.bookValue += a.bookValueCents;
      return acc;
    },
    { cost: 0n, accumulated: 0n, bookValue: 0n }
  );

  const now = new Date();
  const targetYear = now.getUTCFullYear();
  const targetMonth = now.getUTCMonth();
  const targetLabel = new Date(Date.UTC(targetYear, targetMonth, 1)).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Fixed Assets
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Capitalize equipment, vehicles, and computers. KOBIA auto-posts depreciation each month.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/books/assets/new`}
          className="rounded-lg bg-[color:var(--primary,#0ea5e9)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
        >
          + Add asset
        </Link>
      </div>

      {/* Totals */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Card label="Total cost" value={formatCents(totals.cost)} />
        <Card label="Accumulated depreciation" value={formatCents(totals.accumulated)} muted />
        <Card label="Net book value" value={formatCents(totals.bookValue)} emphasis />
      </div>

      {/* Bulk post depreciation */}
      {enriched.some((a) => a.status === "ACTIVE") && (
        <form
          action={postBulkDepreciationAction}
          className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-900/20"
        >
          <input type="hidden" name="slug" value={params.tenant} />
          <input type="hidden" name="year" value={targetYear} />
          <input type="hidden" name="monthIdx" value={targetMonth} />
          <div className="text-sm text-emerald-900 dark:text-emerald-100">
            <strong>Run monthly depreciation</strong> for {targetLabel}. KOBIA will post a journal
            entry for every active asset (already-posted months are skipped).
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Post {targetLabel}
          </button>
        </form>
      )}

      {/* Assets table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">In service</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Accumulated</th>
              <th className="px-4 py-3 text-right">Book value</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {enriched.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                  No fixed assets yet. <Link href={`/${params.tenant}/books/assets/new`} className="text-[color:var(--primary,#0ea5e9)] underline">Add your first asset</Link>.
                </td>
              </tr>
            )}
            {enriched.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                <td className="px-4 py-3">
                  <Link
                    href={`/${params.tenant}/books/assets/${a.id}`}
                    className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                  >
                    {a.name}
                  </Link>
                  {a.category && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{a.category}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                  {a.acquisitionDate.toLocaleDateString("en-US", {
                    timeZone: "UTC",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                  {formatCents(a.costCents)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400">
                  {formatCents(a.accumulatedCents)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-50">
                  {formatCents(a.bookValueCents)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={a.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, muted, emphasis }: { label: string; value: string; muted?: boolean; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`mt-1 font-mono text-2xl font-bold ${
          emphasis
            ? "text-slate-900 dark:text-slate-50"
            : muted
              ? "text-slate-500 dark:text-slate-400"
              : "text-slate-800 dark:text-slate-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED" }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    FULLY_DEPRECIATED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    DISPOSED: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  };
  const labels: Record<string, string> = {
    ACTIVE: "Active",
    FULLY_DEPRECIATED: "Fully depreciated",
    DISPOSED: "Disposed",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
