"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

type Props = {
  tenantSlug: string;
  bankAccountId: string;
  sessionId: string;
};

export function ReconcileWorkspace({ tenantSlug, bankAccountId, sessionId }: Props) {
  const router = useRouter();
  const sessionQuery = trpc.bank.getReconciliation.useQuery({ sessionId });

  const toggleMut = trpc.bank.toggleClear.useMutation({
    onSuccess: () => sessionQuery.refetch(),
    onError: (e) => alert(e.message),
  });

  const completeMut = trpc.bank.completeReconciliation.useMutation({
    onSuccess: () => {
      router.push(`/${tenantSlug}/bank/${bankAccountId}`);
      router.refresh();
    },
    onError: (e) => alert(e.message),
  });

  if (sessionQuery.isPending) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
        Loading reconciliation...
      </div>
    );
  }
  if (sessionQuery.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
        Error: {sessionQuery.error.message}
      </div>
    );
  }

  const s = sessionQuery.data!;
  const driftCents = BigInt(s.status.driftCents);
  const isBalanced = driftCents === 0n;
  const isCompleted = s.sessionStatus === "COMPLETED";

  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Reconciliation: {new Date(s.statementStartDate).toLocaleDateString()} →{" "}
            {new Date(s.statementEndDate).toLocaleDateString()}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {s.bankAccountName} ·{" "}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isCompleted
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {s.sessionStatus.replace("_", " ")}
            </span>
          </p>
        </div>
        {!isCompleted && (
          <button
            type="button"
            disabled={!isBalanced || completeMut.isPending}
            onClick={() => {
              if (
                confirm(
                  "Complete this reconciliation? Cleared transactions will be locked and the session closed."
                )
              ) {
                completeMut.mutate({ sessionId });
              }
            }}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={isBalanced ? "Complete reconciliation" : "Drift must be $0.00 to complete"}
          >
            {completeMut.isPending ? "Completing..." : "Complete Reconciliation"}
          </button>
        )}
      </div>

      {/* Drift summary */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard
          label="Statement start"
          value={s.statementStartDisplay}
          subtitle={new Date(s.statementStartDate).toLocaleDateString()}
        />
        <StatCard
          label="Statement end"
          value={s.statementEndDisplay}
          subtitle={new Date(s.statementEndDate).toLocaleDateString()}
        />
        <StatCard
          label="Expected change"
          value={s.status.expectedChangeDisplay}
          subtitle="End − Start"
        />
        <StatCard
          label="Drift"
          value={s.status.driftDisplay}
          subtitle={isBalanced ? "Balanced ✓" : "Expected − Cleared"}
          accent={isBalanced ? "emerald" : "red"}
        />
      </div>

      <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
        <span className="text-slate-700">
          Cleared{" "}
          <span className="font-mono font-medium">{s.status.clearedTotalDisplay}</span> across{" "}
          {s.status.selectedCount} transaction{s.status.selectedCount === 1 ? "" : "s"}
        </span>
        {s.status.unmatchedCount > 0 && (
          <span className="ml-3 text-amber-700">
            ({s.status.unmatchedCount} unmatched still in date range — match those first)
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="w-12 px-4 py-2.5 text-left font-medium">✓</th>
              <th className="w-32 px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-left font-medium">Description</th>
              <th className="w-24 px-4 py-2.5 text-left font-medium">Status</th>
              <th className="w-32 px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {s.transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  No matched or categorized transactions in this statement window. Go back and
                  match your imported transactions first.
                </td>
              </tr>
            ) : (
              s.transactions.map((t) => {
                const isInflow = BigInt(t.amountCents) > 0n;
                return (
                  <tr key={t.id} className={t.isCleared ? "bg-emerald-50/40" : ""}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={t.isCleared}
                        disabled={isCompleted || toggleMut.isPending}
                        onChange={(e) =>
                          toggleMut.mutate({
                            sessionId,
                            bankTxnId: t.id,
                            include: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                      {new Date(t.postedDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-slate-900">{t.description}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                          t.status === "MATCHED"
                            ? "bg-blue-100 text-blue-800"
                            : t.status === "CATEGORIZED"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        isInflow ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {t.amountDisplay}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "emerald" | "red";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "red"
      ? "text-red-700"
      : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${accentClass}`}>
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
}
