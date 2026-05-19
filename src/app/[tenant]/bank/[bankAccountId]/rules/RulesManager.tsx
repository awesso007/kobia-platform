"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

type OffsetAccount = { id: string; code: string; name: string; type: string };

type Props = {
  bankAccountId: string;
  offsetAccounts: OffsetAccount[];
};

export function RulesManager({ bankAccountId, offsetAccounts }: Props) {
  const router = useRouter();
  const rulesQuery = trpc.bank.listRules.useQuery({ bankAccountId });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [offsetId, setOffsetId] = useState<string>(offsetAccounts[0]?.id ?? "");
  const [appliesToInflow, setAppliesToInflow] = useState(true);
  const [appliesToOutflow, setAppliesToOutflow] = useState(true);
  const [memo, setMemo] = useState("");
  const [priority, setPriority] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const createMut = trpc.bank.createRule.useMutation({
    onSuccess: (r) => {
      setError(null);
      setResult(`Rule created. Auto-categorized ${r.categorizedNow} existing transaction(s).`);
      setName("");
      setKeyword("");
      setMemo("");
      setShowForm(false);
      rulesQuery.refetch();
      router.refresh();
    },
    onError: (e) => {
      setError(e.message);
      setResult(null);
    },
  });

  const deleteMut = trpc.bank.deleteRule.useMutation({
    onSuccess: () => {
      rulesQuery.refetch();
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!name.trim() || !keyword.trim() || !offsetId) {
      setError("All required fields must be filled.");
      return;
    }
    const p = parseInt(priority, 10);
    if (Number.isNaN(p) || p < 0 || p > 1000) {
      setError("Priority must be 0-1000.");
      return;
    }
    createMut.mutate({
      bankAccountId,
      name: name.trim(),
      descriptionContains: keyword.trim(),
      offsetAccountId: offsetId,
      appliesToInflow,
      appliesToOutflow,
      memoTemplate: memo.trim() || undefined,
      priority: p,
    });
  }

  const rules = rulesQuery.data ?? [];

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {rules.length} rule{rules.length === 1 ? "" : "s"}
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Rule
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {result && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {result}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Rule name *</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                placeholder="Adobe → Software"
                className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Description contains *</span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                maxLength={200}
                required
                placeholder="Adobe"
                className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Offset account *</span>
            <select
              value={offsetId}
              onChange={(e) => setOffsetId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Select...</option>
              {offsetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name} ({a.type})
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={appliesToInflow}
                onChange={(e) => setAppliesToInflow(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-medium text-slate-700">Apply to inflows</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={appliesToOutflow}
                onChange={(e) => setAppliesToOutflow(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-medium text-slate-700">Apply to outflows</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Priority</span>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                min={0}
                max={1000}
                className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-600">Memo template (optional)</span>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={500}
              placeholder="Used as the journal entry memo when applied"
              className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : "Create rule"}
            </button>
          </div>
        </form>
      )}

      {rulesQuery.isPending ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading rules...
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-slate-500">No auto-categorization rules yet.</p>
          <p className="mt-2 text-xs text-slate-400">
            Create rules to auto-post journal entries for recurring transactions.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 text-left font-medium">Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Matches</th>
                <th className="px-4 py-2.5 text-left font-medium">Posts to</th>
                <th className="px-4 py-2.5 text-right font-medium">Priority</th>
                <th className="px-4 py-2.5 text-right font-medium">Times applied</th>
                <th className="px-4 py-2.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {rules.map((r) => (
                <tr key={r.id} className={r.isActive ? "" : "opacity-60"}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    <span className="font-mono text-xs">contains</span>{" "}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                      {r.descriptionContains}
                    </span>
                    <div className="mt-0.5 text-[10px] uppercase text-slate-400">
                      {r.appliesToInflow && r.appliesToOutflow
                        ? "in & out"
                        : r.appliesToInflow
                        ? "inflows only"
                        : "outflows only"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {r.offsetAccount ? (
                      <>
                        <span className="font-mono text-xs">{r.offsetAccount.code}</span>{" "}
                        {r.offsetAccount.name}
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                    {r.priority}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                    {r.appliedCount}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (confirm(`Delete rule "${r.name}"?`)) {
                          deleteMut.mutate({ ruleId: r.id });
                        }
                      }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
