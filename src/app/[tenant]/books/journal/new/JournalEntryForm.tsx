"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

type Account = { id: string; code: string; name: string; type: string };

type Line = {
  accountId: string;
  debit: string; // user-entered dollar string, e.g. "1,250.00"
  credit: string;
  memo: string;
};

const emptyLine = (): Line => ({ accountId: "", debit: "", credit: "", memo: "" });

/** Parse a user-entered dollar string into integer cents. Returns null on invalid. */
function dollarsToCents(value: string): bigint | null {
  const cleaned = value.replace(/[,\s$]/g, "").trim();
  if (!cleaned) return 0n;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = "0", fraction = ""] = cleaned.split(".");
  const paddedFraction = (fraction + "00").slice(0, 2);
  return BigInt(whole || "0") * 100n + BigInt(paddedFraction);
}

function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = (abs / 100n).toLocaleString("en-US");
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "(" : ""}$${whole}.${fraction}${negative ? ")" : ""}`;
}

export function JournalEntryForm({
  tenantSlug,
  entityId,
  accounts,
}: {
  tenantSlug: string;
  entityId: string;
  accounts: Account[];
}) {
  const router = useRouter();
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const postEntry = trpc.books.postJournalEntry.useMutation({
    onSuccess: (data) => {
      router.push(`/${tenantSlug}/books?posted=${data.entryNumber}`);
      router.refresh();
    },
    onError: (err) => setError(err.message),
  });

  const { totalDebit, totalCredit, isBalanced, hasContent } = useMemo(() => {
    let td = 0n;
    let tc = 0n;
    let any = false;
    for (const l of lines) {
      const d = dollarsToCents(l.debit);
      const c = dollarsToCents(l.credit);
      if (d !== null) td += d;
      if (c !== null) tc += c;
      if (l.accountId || l.debit || l.credit) any = true;
    }
    return { totalDebit: td, totalCredit: tc, isBalanced: td === tc && td > 0n, hasContent: any };
  }, [lines]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    const cleanedLines: Array<{
      accountId: string;
      debitCents: string;
      creditCents: string;
      memo?: string;
    }> = [];

    for (const [i, l] of lines.entries()) {
      const d = dollarsToCents(l.debit);
      const c = dollarsToCents(l.credit);
      if (d === null || c === null) {
        setError(`Line ${i + 1}: invalid amount.`);
        return;
      }
      if (!l.accountId) {
        // Skip empty trailing lines
        if (d === 0n && c === 0n) continue;
        setError(`Line ${i + 1}: pick an account.`);
        return;
      }
      if (d > 0n && c > 0n) {
        setError(`Line ${i + 1}: a line cannot have both debit and credit.`);
        return;
      }
      if (d === 0n && c === 0n) {
        setError(`Line ${i + 1}: enter a debit or credit amount.`);
        return;
      }
      cleanedLines.push({
        accountId: l.accountId,
        debitCents: d.toString(),
        creditCents: c.toString(),
        memo: l.memo.trim() || undefined,
      });
    }

    if (cleanedLines.length < 2) {
      setError("At least 2 lines required.");
      return;
    }

    let td = 0n;
    let tc = 0n;
    for (const l of cleanedLines) {
      td += BigInt(l.debitCents);
      tc += BigInt(l.creditCents);
    }
    if (td !== tc) {
      setError(`Out of balance by ${formatCents(td - tc)}. Debits must equal credits.`);
      return;
    }

    postEntry.mutate({
      entityId,
      entryDate: new Date(entryDate).toISOString(),
      description: description.trim(),
      memo: memo.trim() || undefined,
      lines: cleanedLines,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Date</label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Cash payment received from client"
            required
            maxLength={500}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
              <th className="px-3 py-2 font-medium">Memo</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <select
                    value={line.accountId}
                    onChange={(e) => updateLine(i, { accountId: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— select account —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={line.debit}
                    onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={line.credit}
                    onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={line.memo}
                    onChange={(e) => updateLine(i, { memo: e.target.value })}
                    placeholder="Optional"
                    maxLength={500}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-slate-400 hover:text-red-500"
                      aria-label="Remove line"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500">Totals</td>
              <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums">
                {formatCents(totalDebit)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums">
                {formatCents(totalCredit)}
              </td>
              <td className="px-3 py-2" colSpan={2}>
                {hasContent && (
                  isBalanced ? (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ Balanced
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Out of balance by {formatCents(totalDebit - totalCredit)}
                    </span>
                  )
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addLine}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          + Add line
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Memo (optional)</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Additional notes for this entry"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
        <Link
          href={`/${tenantSlug}/books`}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={postEntry.isPending || !isBalanced}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          {postEntry.isPending ? "Posting..." : "Post Entry"}
        </button>
      </div>
    </form>
  );
}
