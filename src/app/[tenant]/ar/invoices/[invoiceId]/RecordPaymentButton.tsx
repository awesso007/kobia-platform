"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

type CashAccount = { id: string; code: string; name: string };

type Props = {
  tenantSlug: string;
  invoiceId: string;
  balanceCents: string; // serialized BigInt
  balanceDisplay: string;
  cashAccounts: CashAccount[];
};

function parseDollarsToCents(input: string): bigint | null {
  const trimmed = input.trim().replace(/[$,\s]/g, "");
  if (!trimmed) return null;
  if (!/^-?\d*(\.\d{1,2})?$/.test(trimmed)) return null;
  const neg = trimmed.startsWith("-");
  const body = neg ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = body.split(".");
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2) || "0");
  return neg ? -cents : cents;
}

export function RecordPaymentButton({
  invoiceId,
  balanceCents,
  balanceDisplay,
  cashAccounts,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState(() => {
    // Default to full balance, formatted as dollars
    const cents = BigInt(balanceCents);
    const whole = cents / 100n;
    const frac = (cents < 0n ? -cents : cents) % 100n;
    return `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  });
  const [cashAccountId, setCashAccountId] = useState<string>(cashAccounts[0]?.id ?? "");
  const [method, setMethod] = useState<string>("check");
  const [reference, setReference] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const pay = trpc.ar.recordPayment.useMutation({
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountCents = parseDollarsToCents(amount);
    if (amountCents === null || amountCents <= 0n) {
      setError("Enter a positive payment amount.");
      return;
    }
    if (amountCents > BigInt(balanceCents)) {
      setError(`Payment exceeds balance due (${balanceDisplay}).`);
      return;
    }
    if (!cashAccountId) {
      setError("Select a cash/bank account.");
      return;
    }

    pay.mutate({
      invoiceId,
      paymentDate: new Date(paymentDate).toISOString(),
      amountCents: amountCents.toString(),
      cashAccountId,
      method: method || undefined,
      reference: reference.trim() || undefined,
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Record payment
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">Record payment</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Balance due: <span className="font-medium">{balanceDisplay}</span>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Payment date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Deposit to (cash account)
                </label>
                <select
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                >
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="check">Check</option>
                    <option value="ach">ACH</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="wire">Wire</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Reference</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Check #, etc."
                    className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  disabled={pay.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pay.isPending}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pay.isPending ? "Recording…" : "Record payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
