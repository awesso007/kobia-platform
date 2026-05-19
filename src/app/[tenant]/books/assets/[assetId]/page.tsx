import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { buildSchedule, totalPostedFor } from "@/lib/accounting/depreciation";
import {
  postDepreciationAction,
  disposeAssetAction,
} from "@/app/actions/fixed-asset-actions";

export const dynamic = "force-dynamic";

export default async function FixedAssetDetailPage({
  params,
}: {
  params: { tenant: string; assetId: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const asset = await db.fixedAsset.findFirst({
    where: { id: params.assetId, tenantId: auth.tenant.id },
  });
  if (!asset) notFound();

  const [accumulated, postedRows, assetAccount, accumAccount, expenseAccount] = await Promise.all([
    totalPostedFor(asset.id),
    db.depreciationEntry.findMany({
      where: { fixedAssetId: asset.id },
      orderBy: { periodStart: "asc" },
      select: { periodStart: true, amountCents: true, journalEntryId: true },
    }),
    db.account.findUnique({ where: { id: asset.assetAccountId }, select: { code: true, name: true } }),
    db.account.findUnique({
      where: { id: asset.accumulatedDepreciationAccountId },
      select: { code: true, name: true },
    }),
    db.account.findUnique({
      where: { id: asset.depreciationExpenseAccountId },
      select: { code: true, name: true },
    }),
  ]);

  const schedule = buildSchedule(asset);
  const postedByStart = new Map(postedRows.map((r) => [r.periodStart.getTime(), r]));

  const bookValue = asset.costCents - accumulated;
  const depBase = asset.costCents - asset.salvageValueCents;
  const pctDepreciated = depBase > 0n ? Number((accumulated * 1000n) / depBase) / 10 : 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        href={`/${params.tenant}/books/assets`}
        className="text-sm text-slate-500 hover:underline dark:text-slate-400"
      >
        &larr; Back to assets
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {asset.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {asset.category ?? "Uncategorized"} · In service{" "}
            {asset.acquisitionDate.toLocaleDateString("en-US", {
              timeZone: "UTC",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {asset.description && (
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{asset.description}</p>
          )}
        </div>
        <StatusPill status={asset.status} />
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <Card label="Cost" value={formatCents(asset.costCents)} />
        <Card label="Salvage" value={formatCents(asset.salvageValueCents)} muted />
        <Card label="Accumulated" value={formatCents(accumulated)} muted />
        <Card label="Book value" value={formatCents(bookValue)} emphasis />
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Depreciation progress</span>
          <span>{pctDepreciated.toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-[color:var(--primary,#0ea5e9)]"
            style={{ width: `${Math.min(100, pctDepreciated)}%` }}
          />
        </div>
      </div>

      {/* Account mapping */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="font-semibold text-slate-700 dark:text-slate-300">Account mapping</p>
        <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-400">
          <li>
            Asset → <span className="font-mono">{assetAccount?.code}</span> {assetAccount?.name}
          </li>
          <li>
            Accumulated depreciation → <span className="font-mono">{accumAccount?.code}</span> {accumAccount?.name}
          </li>
          <li>
            Depreciation expense → <span className="font-mono">{expenseAccount?.code}</span> {expenseAccount?.name}
          </li>
          <li>
            Useful life → {asset.usefulLifeMonths} months ({(asset.usefulLifeMonths / 12).toFixed(1)} years), straight-line
          </li>
        </ul>
      </div>

      {/* Schedule */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Depreciation schedule</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2 text-right">Monthly</th>
                <th className="px-4 py-2 text-right">Accumulated</th>
                <th className="px-4 py-2 text-right">Book value</th>
                <th className="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {schedule.map((row) => {
                const posted = postedByStart.get(row.periodStart.getTime());
                const isCurrent = !posted && row.periodStart.getUTCFullYear() === new Date().getUTCFullYear() && row.periodStart.getUTCMonth() === new Date().getUTCMonth();
                return (
                  <tr
                    key={row.monthIdx}
                    className={`${
                      posted ? "bg-emerald-50/30 dark:bg-emerald-900/10" : ""
                    } ${isCurrent ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}
                  >
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      {row.monthIdx}. {row.label}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{formatCents(row.monthlyCents)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-500 dark:text-slate-400">
                      {formatCents(row.accumulatedCents)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{formatCents(row.bookValueCents)}</td>
                    <td className="px-4 py-2 text-right">
                      {posted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          ✓ Posted
                        </span>
                      ) : asset.status === "DISPOSED" ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <form action={postDepreciationAction} className="inline-flex">
                          <input type="hidden" name="slug" value={params.tenant} />
                          <input type="hidden" name="fixedAssetId" value={asset.id} />
                          <input type="hidden" name="year" value={row.periodStart.getUTCFullYear()} />
                          <input type="hidden" name="monthIdx" value={row.periodStart.getUTCMonth()} />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                          >
                            Post
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispose */}
      {asset.status !== "DISPOSED" && (
        <details className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-900/10">
          <summary className="cursor-pointer text-sm font-semibold text-rose-700 dark:text-rose-400">
            Dispose this asset
          </summary>
          <form action={disposeAssetAction} className="mt-3 space-y-3">
            <input type="hidden" name="slug" value={params.tenant} />
            <input type="hidden" name="fixedAssetId" value={asset.id} />
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dispose date</label>
              <input
                type="date"
                name="disposedDate"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
              <textarea
                name="notes"
                rows={2}
                placeholder="Sold, scrapped, traded in, etc."
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              This marks the asset disposed and stops future depreciation. The gain/loss JE on disposal is a manual entry for now.
            </p>
            <button
              type="submit"
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
            >
              Confirm disposal
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

function Card({ label, value, muted, emphasis }: { label: string; value: string; muted?: boolean; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-bold ${
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
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
