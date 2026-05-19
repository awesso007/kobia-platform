"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc-client";

type Customer = { id: string; name: string; defaultTermsDays: number };
type RevenueAccount = { id: string; code: string; name: string };
type TaxRate = { id: string; name: string; rateBps: number; isDefault: boolean };

type LineDraft = {
  accountId: string;
  description: string;
  // Strings while editing for UX; parsed on submit
  quantity: string;
  unitPriceDollars: string;
};

function emptyLine(defaultAccountId: string): LineDraft {
  return {
    accountId: defaultAccountId,
    description: "",
    quantity: "1",
    unitPriceDollars: "",
  };
}

/** Parse a dollar string ("1,234.56") to cents bigint. Throws on invalid. */
function parseDollarsToCents(s: string): bigint {
  const cleaned = s.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    throw new Error(`Invalid dollar amount: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(fracPadded);
}

/** Parse a quantity string ("1.5", "3") to milli-units bigint (3 decimal precision). */
function parseQuantityToMilli(s: string): bigint {
  const cleaned = s.trim().replace(/[,\s]/g, "");
  if (cleaned === "") return 0n;
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) {
    throw new Error(`Invalid quantity: "${s}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "000").slice(0, 3);
  return BigInt(whole) * 1000n + BigInt(fracPadded);
}

function formatCentsForDisplay(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  const wholeStr = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}$${wholeStr}.${frac}`;
}

const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "CNY",
  "MXN",
  "INR",
  "BRL",
  "NGN",
  "ZAR",
  "SGD",
  "HKD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "AED",
] as const;

export function NewInvoiceForm({
  tenantSlug,
  entityId,
  baseCurrency,
  customers,
  revenueAccounts,
  taxRates,
  preselectedCustomerId,
}: {
  tenantSlug: string;
  entityId: string;
  baseCurrency: string;
  customers: Customer[];
  revenueAccounts: RevenueAccount[];
  taxRates: TaxRate[];
  preselectedCustomerId: string | null;
}) {
  const router = useRouter();
  const defaultAccountId = revenueAccounts[0]?.id ?? "";

  const initialCustomerId =
    (preselectedCustomerId && customers.find((c) => c.id === preselectedCustomerId)?.id) ||
    customers[0]?.id ||
    "";

  const [customerId, setCustomerId] = useState(initialCustomerId);

  const today = new Date().toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => {
    const c = customers.find((c) => c.id === initialCustomerId);
    const d = new Date();
    d.setDate(d.getDate() + (c?.defaultTermsDays ?? 30));
    return d.toISOString().slice(0, 10);
  });
  const [memo, setMemo] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const defaultTaxRateId = taxRates.find((t) => t.isDefault)?.id ?? "";
  const [taxRateId, setTaxRateId] = useState(defaultTaxRateId);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(defaultAccountId)]);
  const [error, setError] = useState<string | null>(null);

  // Re-derive due date when customer changes
  function handleCustomerChange(id: string) {
    setCustomerId(id);
    const c = customers.find((c) => c.id === id);
    const baseDate = new Date(issueDate);
    if (!Number.isNaN(baseDate.getTime())) {
      baseDate.setDate(baseDate.getDate() + (c?.defaultTermsDays ?? 30));
      setDueDate(baseDate.toISOString().slice(0, 10));
    }
  }

  function handleIssueDateChange(d: string) {
    setIssueDate(d);
    // Recompute due based on current customer terms
    const c = customers.find((c) => c.id === customerId);
    const baseDate = new Date(d);
    if (!Number.isNaN(baseDate.getTime())) {
      baseDate.setDate(baseDate.getDate() + (c?.defaultTermsDays ?? 30));
      setDueDate(baseDate.toISOString().slice(0, 10));
    }
  }

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(defaultAccountId)]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  // Live subtotal
  const subtotalCents = useMemo(() => {
    let sum = 0n;
    for (const l of lines) {
      try {
        const qty = parseQuantityToMilli(l.quantity || "0");
        const price = parseDollarsToCents(l.unitPriceDollars || "0");
        sum += (qty * price) / 1000n;
      } catch {
        // ignore parse errors while typing
      }
    }
    return sum;
  }, [lines]);

  const selectedTax = taxRates.find((t) => t.id === taxRateId) ?? null;
  const taxBps = BigInt(selectedTax?.rateBps ?? 0);
  const taxCents = taxBps > 0n ? (subtotalCents * taxBps) / 10_000n : 0n;
  const totalCents = subtotalCents + taxCents;

  const post = trpc.ar.createAndPostInvoice.useMutation({
    onSuccess: () => {
      router.push(`/${tenantSlug}/ar/invoices`);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError("Choose a customer.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line.");
      return;
    }

    try {
      const payload = {
        entityId,
        customerId,
        issueDate: new Date(issueDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        memo: memo.trim() || undefined,
        currency: currency === baseCurrency ? undefined : currency,
        taxRateId: taxRateId || undefined,
        lines: lines.map((l, i) => {
          if (!l.accountId) throw new Error(`Line ${i + 1}: pick a revenue account.`);
          if (!l.description.trim()) throw new Error(`Line ${i + 1}: description required.`);
          const qty = parseQuantityToMilli(l.quantity || "0");
          const price = parseDollarsToCents(l.unitPriceDollars || "0");
          if (qty <= 0n) throw new Error(`Line ${i + 1}: quantity must be > 0.`);
          if (price <= 0n) throw new Error(`Line ${i + 1}: unit price must be > 0.`);
          return {
            accountId: l.accountId,
            description: l.description.trim(),
            quantityMilli: qty.toString(),
            unitPriceCents: price.toString(),
          };
        }),
      };
      post.mutate(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not validate the invoice.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Customer *</span>
          <select
            required
            value={customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (Net {c.defaultTermsDays})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Memo</span>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={2000}
            placeholder="Optional"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Issue date *</span>
          <input
            type="date"
            required
            value={issueDate}
            onChange={(e) => handleIssueDateChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Due date *</span>
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
                {c === baseCurrency ? " (base)" : ""}
              </option>
            ))}
          </select>
          {currency !== baseCurrency ? (
            <span className="mt-1 block text-xs text-amber-700">
              Posted to GL in {baseCurrency} at the rate on the issue date. Add rates in Settings → Currencies.
            </span>
          ) : null}
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
          <button
            type="button"
            onClick={addLine}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            + Add line
          </button>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Revenue account</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit price</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => {
                let amount = 0n;
                try {
                  const qty = parseQuantityToMilli(l.quantity || "0");
                  const price = parseDollarsToCents(l.unitPriceDollars || "0");
                  amount = (qty * price) / 1000n;
                } catch {
                  // ignore
                }
                return (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                        placeholder="What was sold or delivered"
                        className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={l.accountId}
                        onChange={(e) => updateLine(i, { accountId: e.target.value })}
                        className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      >
                        {revenueAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                        className="block w-20 rounded-md border-slate-300 px-2 py-1.5 text-right font-mono text-sm shadow-sm tabular-nums focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.unitPriceDollars}
                          onChange={(e) => updateLine(i, { unitPriceDollars: e.target.value })}
                          placeholder="0.00"
                          className="block w-28 rounded-md border-slate-300 py-1.5 pl-5 pr-2 text-right font-mono text-sm shadow-sm tabular-nums focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                      {formatCentsForDisplay(amount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        disabled={lines.length === 1}
                        className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-30"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                  Subtotal
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                  {formatCentsForDisplay(subtotalCents)}
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                  <div className="flex items-center justify-end gap-2">
                    <span>Sales tax</span>
                    <select
                      value={taxRateId}
                      onChange={(e) => setTaxRateId(e.target.value)}
                      className="rounded-md border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      <option value="">No tax</option>
                      {taxRates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({(t.rateBps / 100).toFixed(2)}%)
                          {t.isDefault ? " — default" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">
                  {formatCentsForDisplay(taxCents)}
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-xs uppercase tracking-wide font-semibold text-slate-700">
                  Total
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                  {formatCentsForDisplay(totalCents)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => router.push(`/${tenantSlug}/ar/invoices`)}
          disabled={post.isPending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={post.isPending || totalCents <= 0n}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {post.isPending ? "Posting…" : `Post invoice (${formatCentsForDisplay(totalCents)})`}
        </button>
      </div>
    </form>
  );
}
