"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

type Props = {
  tenantSlug: string;
  bankAccountId: string;
  suggestedStartBalanceCents: string;
  suggestedStartDate: string;
};

function dollarsToCents(input: string): bigint | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  if (!/^-?\d*(\.\d{1,2})?$/.test(cleaned)) return null;
  const neg = cleaned.startsWith("-");
  const body = neg ? cleaned.slice(1) : cleaned;
  const [whole = "0", frac = ""] = body.split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac.padEnd(2, "0").slice(0, 2)) || "0");
  return neg ? -cents : cents;
}

function centsToDollars(c: string): string {
  const big = BigInt(c);
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${neg ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

export function StartReconciliationForm({
  tenantSlug,
  bankAccountId,
  suggestedStartBalanceCents,
  suggestedStartDate,
}: Props) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(suggestedStartDate || today);
  const [endDate, setEndDate] = useState(today);
  const [startBalance, setStartBalance] = useState(centsToDollars(suggestedStartBalanceCents));
  const [endBalance, setEndBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startMut = trpc.bank.startReconciliation.useMutation({
    onSuccess: (r) => {
      router.push(`/${tenantSlug}/bank/${bankAccountId}/reconcile/${r.id}`);
    },
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const startCents = dollarsToCents(startBalance);
    const endCents = dollarsToCents(endBalance);
    if (startCents === null) {
      setError("Enter a valid starting balance.");
      return;
    }
    if (endCents === null) {
      setError("Enter a valid ending balance.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date.");
      return;
    }
    startMut.mutate({
      bankAccountId,
      statementStartDate: new Date(startDate + "T00:00:00.000Z").toISOString(),
      statementEndDate: new Date(endDate + "T23:59:59.999Z").toISOString(),
      statementStartBalanceCents: startCents.toString(),
      statementEndBalanceCents: endCents.toString(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Statement start date *</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Statement end date *</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Statement start balance *</span>
          <input
            type="text"
            value={startBalance}
            onChange={(e) => setStartBalance(e.target.value)}
            required
            placeholder="0.00"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Statement end balance *</span>
          <input
            type="text"
            value={endBalance}
            onChange={(e) => setEndBalance(e.target.value)}
            required
            placeholder="0.00"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={startMut.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {startMut.isPending ? "Starting..." : "Start reconciliation"}
        </button>
      </div>
    </form>
  );
}
