"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

type OffsetAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type Props = {
  tenantSlug: string;
  bankAccountId: string;
  status: "UNMATCHED" | "MATCHED" | "CATEGORIZED" | "CLEARED" | "IGNORED";
  offsetAccounts: OffsetAccount[];
};

export function BankWorkspace({ tenantSlug, bankAccountId, status, offsetAccounts }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const txnsQuery = trpc.bank.listTransactions.useQuery({
    bankAccountId,
    status,
    limit: 200,
  });

  const refresh = () => {
    txnsQuery.refetch();
    router.refresh();
  };

  if (txnsQuery.isPending) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
        Loading transactions...
      </div>
    );
  }

  if (txnsQuery.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
        Failed to load transactions: {txnsQuery.error.message}
      </div>
    );
  }

  const txns = txnsQuery.data ?? [];

  if (txns.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
        <p className="text-slate-500">No {status.toLowerCase()} transactions.</p>
        {status === "UNMATCHED" && (
          <p className="mt-2 text-xs text-slate-400">
            Import a CSV statement to start matching transactions.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {actionError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="w-32 px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-left font-medium">Description</th>
              <th className="w-32 px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="w-72 px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {txns.map((t) => {
              const isInflow = BigInt(t.amountCents) > 0n;
              const expanded = expandedId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr
                    className={`cursor-pointer ${expanded ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    onClick={() => setExpandedId(expanded ? null : t.id)}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                      {new Date(t.postedDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-slate-900">{t.description}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        isInflow ? "text-emerald-700" : "text-slate-900"
                      }`}
                    >
                      {t.amountDisplay}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1.5">
                        {t.status === "UNMATCHED" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : t.id)}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {expanded ? "Close" : "Match / Categorize"}
                            </button>
                          </>
                        )}
                        {(t.status === "MATCHED" || t.status === "CATEGORIZED") && (
                          <UnmatchButton
                            tenantSlug={tenantSlug}
                            bankTxnId={t.id}
                            journalEntryId={
                              t.matchedJournalEntryId ?? t.categorizedJournalEntryId ?? null
                            }
                            onDone={refresh}
                            onError={setActionError}
                          />
                        )}
                        {t.status === "UNMATCHED" && (
                          <IgnoreButton
                            bankTxnId={t.id}
                            onDone={refresh}
                            onError={setActionError}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && t.status === "UNMATCHED" && (
                    <tr className="bg-blue-50">
                      <td colSpan={4} className="px-4 pb-4 pt-1">
                        <MatchAndCategorizePanel
                          tenantSlug={tenantSlug}
                          bankTxnId={t.id}
                          offsetAccounts={offsetAccounts}
                          isInflow={isInflow}
                          onDone={() => {
                            setExpandedId(null);
                            refresh();
                          }}
                          onError={setActionError}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MatchAndCategorizePanel({
  tenantSlug,
  bankTxnId,
  offsetAccounts,
  isInflow,
  onDone,
  onError,
}: {
  tenantSlug: string;
  bankTxnId: string;
  offsetAccounts: OffsetAccount[];
  isInflow: boolean;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const matchesQuery = trpc.bank.findMatches.useQuery({ bankTxnId });
  const matchMut = trpc.bank.matchToJE.useMutation({
    onSuccess: () => {
      onError(null);
      onDone();
    },
    onError: (e) => onError(e.message),
  });
  const categorizeMut = trpc.bank.categorize.useMutation({
    onSuccess: () => {
      onError(null);
      onDone();
    },
    onError: (e) => onError(e.message),
  });

  // Suggest defaults: inflow → revenue/AR; outflow → expense/AP
  const suggestedTypes = isInflow ? ["REVENUE", "ASSET"] : ["EXPENSE", "LIABILITY"];
  const sortedOffsets = [...offsetAccounts].sort((a, b) => {
    const aRank = suggestedTypes.indexOf(a.type);
    const bRank = suggestedTypes.indexOf(b.type);
    const aS = aRank === -1 ? 99 : aRank;
    const bS = bRank === -1 ? 99 : bRank;
    if (aS !== bS) return aS - bS;
    return a.code.localeCompare(b.code);
  });

  const [offsetId, setOffsetId] = useState<string>(sortedOffsets[0]?.id ?? "");
  const [memo, setMemo] = useState<string>("");

  return (
    <div className="grid gap-4 rounded-md border border-blue-200 bg-white p-4 md:grid-cols-2">
      {/* Left: Match candidates */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Match to existing entry
        </h3>
        {matchesQuery.isPending ? (
          <p className="text-sm text-slate-500">Searching...</p>
        ) : matchesQuery.error ? (
          <p className="text-sm text-red-700">Error: {matchesQuery.error.message}</p>
        ) : (matchesQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">
            No matching journal entries found within ±5 days.
          </p>
        ) : (
          <ul className="space-y-2">
            {(matchesQuery.data ?? []).map((c) => (
              <li
                key={c.journalEntryId}
                className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Link
                      href={`/${tenantSlug}/books/journal/${c.journalEntryId}`}
                      className="font-mono text-xs text-blue-700 hover:underline"
                      target="_blank"
                    >
                      {c.entryNumber}
                    </Link>
                    <span className="truncate text-slate-900">{c.description}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {new Date(c.entryDate).toLocaleDateString()} · {c.amountDisplay} ·
                    <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                      score {c.score.toFixed(2)}
                    </span>
                    <span className="ml-1 text-slate-400">{c.reason}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={matchMut.isPending}
                  onClick={() =>
                    matchMut.mutate({ bankTxnId, journalEntryId: c.journalEntryId })
                  }
                  className="ml-2 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {matchMut.isPending ? "..." : "Match"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: Categorize */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Or create new entry (categorize)
        </h3>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Offset account</span>
          <select
            value={offsetId}
            onChange={(e) => setOffsetId(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">Select...</option>
            {sortedOffsets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name} ({a.type})
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-600">Memo (optional)</span>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={500}
            placeholder="Optional memo for the journal entry"
            className="mt-1 block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!offsetId || categorizeMut.isPending}
            onClick={() =>
              categorizeMut.mutate({
                bankTxnId,
                offsetAccountId: offsetId,
                memo: memo || undefined,
              })
            }
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {categorizeMut.isPending ? "Categorizing..." : "Create entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnmatchButton({
  tenantSlug,
  bankTxnId,
  journalEntryId,
  onDone,
  onError,
}: {
  tenantSlug: string;
  bankTxnId: string;
  journalEntryId: string | null;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const unmatchMut = trpc.bank.unmatch.useMutation({
    onSuccess: () => {
      onError(null);
      onDone();
    },
    onError: (e) => onError(e.message),
  });
  return (
    <>
      {journalEntryId && (
        <Link
          href={`/${tenantSlug}/books/journal/${journalEntryId}`}
          target="_blank"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          View JE
        </Link>
      )}
      <button
        type="button"
        disabled={unmatchMut.isPending}
        onClick={() => {
          if (confirm("Unmatch this transaction? (Categorized entries will be reversed.)")) {
            unmatchMut.mutate({ bankTxnId });
          }
        }}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {unmatchMut.isPending ? "..." : "Unmatch"}
      </button>
    </>
  );
}

function IgnoreButton({
  bankTxnId,
  onDone,
  onError,
}: {
  bankTxnId: string;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const ignoreMut = trpc.bank.ignore.useMutation({
    onSuccess: () => {
      onError(null);
      onDone();
    },
    onError: (e) => onError(e.message),
  });
  return (
    <button
      type="button"
      disabled={ignoreMut.isPending}
      onClick={() => ignoreMut.mutate({ bankTxnId })}
      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
    >
      {ignoreMut.isPending ? "..." : "Ignore"}
    </button>
  );
}
