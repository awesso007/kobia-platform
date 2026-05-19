import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  toggleRecurringJEAction,
  deleteRecurringJEAction,
  runRecurringJENowAction,
  runAllDueRecurringJEsAction,
} from "@/app/actions/recurring-je-actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function RecurringJEsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug: params.tenant,
  });
  if (!entity) redirect(`/${params.tenant}/books`);

  const templates = await db.recurringJournalEntry.findMany({
    where: { tenantId: auth.tenant.id, entityId: entity.id },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" },
        include: { account: { select: { code: true, name: true } } },
      },
    },
    orderBy: [{ isActive: "desc" }, { nextRunDate: "asc" }],
  });

  const now = new Date();
  const dueCount = templates.filter(
    (t) => t.isActive && t.nextRunDate <= now,
  ).length;

  // Read one-shot run result cookie (15s TTL set by the action).
  const c = cookies();
  let runResult:
    | { posted: number; failed: number; bulk?: number; name?: string; error?: string | null }
    | null = null;
  const raw = c.get("kobia_recurring_je_result")?.value;
  if (raw) {
    try {
      runResult = JSON.parse(raw);
    } catch {
      runResult = null;
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recurring journal entries</h1>
          <p className="mt-1 text-sm text-slate-500">
            Schedule depreciation, accruals, and any other periodic entry. KOBIA posts
            them automatically on each run date.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/books/recurring-jes/new`}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New template
        </Link>
      </div>

      {runResult && runResult.bulk ? (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            runResult.failed > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          Ran due templates: {runResult.posted} posted, {runResult.failed} failed.
        </div>
      ) : null}

      {runResult && !runResult.bulk ? (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            runResult.failed > 0
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {runResult.failed > 0
            ? `Run failed for ${runResult.name ?? "template"}: ${runResult.error ?? "unknown error"}`
            : `Posted entry for ${runResult.name ?? "template"}.`}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Templates</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{templates.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Active</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {templates.filter((t) => t.isActive).length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Due now</p>
          <p
            className={`mt-1 text-2xl font-semibold ${dueCount > 0 ? "text-amber-700" : "text-slate-900"}`}
          >
            {dueCount}
          </p>
        </div>
      </div>

      {dueCount > 0 && (
        <form action={runAllDueRecurringJEsAction} className="mt-4">
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <button className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            Run all due ({dueCount})
          </button>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No recurring entries yet. Create your first template — e.g. monthly depreciation
          or quarterly tax accrual.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {templates.map((t) => {
            const isDue = t.isActive && t.nextRunDate <= now;
            const totalDebit = t.lines.reduce((s, l) => s + l.debitCents, 0n);
            return (
              <div
                key={t.id}
                className={`rounded-lg border ${t.isActive ? "border-slate-200" : "border-slate-200 opacity-60"} bg-white p-4`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">{t.name}</h2>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {t.frequency}
                      </span>
                      {!t.isActive && (
                        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                          Paused
                        </span>
                      )}
                      {isDue && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          Due
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Next run: <span className="font-medium">{fmtDate(t.nextRunDate)}</span> •
                      Last run: {fmtDate(t.lastRunDate)} • Runs so far: {t.runCount}
                      {t.endDate && <> • Ends: {fmtDate(t.endDate)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.isActive && (
                      <form action={runRecurringJENowAction}>
                        <input type="hidden" name="tenantSlug" value={params.tenant} />
                        <input type="hidden" name="recurringId" value={t.id} />
                        <button className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                          Run now
                        </button>
                      </form>
                    )}
                    <form action={toggleRecurringJEAction}>
                      <input type="hidden" name="tenantSlug" value={params.tenant} />
                      <input type="hidden" name="recurringId" value={t.id} />
                      <button className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        {t.isActive ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteRecurringJEAction}>
                      <input type="hidden" name="tenantSlug" value={params.tenant} />
                      <input type="hidden" name="recurringId" value={t.id} />
                      <button className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Account</th>
                        <th className="px-3 py-1.5 text-right font-medium">Debit</th>
                        <th className="px-3 py-1.5 text-right font-medium">Credit</th>
                        <th className="px-3 py-1.5 font-medium">Memo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.lines.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-700">
                            <span className="font-mono text-xs text-slate-400">
                              {l.account.code}
                            </span>{" "}
                            {l.account.name}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                            {l.debitCents > 0n ? formatCents(l.debitCents) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">
                            {l.creditCents > 0n ? formatCents(l.creditCents) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-slate-500">
                            {l.memo ?? ""}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-200 bg-slate-50 text-xs">
                        <td className="px-3 py-1.5 font-medium text-slate-600">Totals</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatCents(totalDebit)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatCents(totalDebit)}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-xs text-slate-400">
        <Link href={`/${params.tenant}/books`} className="hover:text-slate-600">
          ← Books
        </Link>
      </div>
    </div>
  );
}
