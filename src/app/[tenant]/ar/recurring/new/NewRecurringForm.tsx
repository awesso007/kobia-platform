"use client";

import { useMemo, useState } from "react";
import { createRecurringInvoice } from "@/app/actions/recurring-actions";

type Customer = { id: string; name: string; defaultTermsDays: number };
type RevenueAccount = { id: string; code: string; name: string };

type LineDraft = {
  accountId: string;
  description: string;
  quantity: string;
  unitPriceDollars: string;
};

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

function emptyLine(defaultAccountId: string): LineDraft {
  return {
    accountId: defaultAccountId,
    description: "",
    quantity: "1",
    unitPriceDollars: "",
  };
}

function parseDollarsForDisplay(s: string): number {
  const cleaned = s.trim().replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return 0;
  return parseFloat(cleaned);
}

function parseQuantityForDisplay(s: string): number {
  const cleaned = s.trim().replace(/[,\s]/g, "");
  if (cleaned === "" || !/^\d+(\.\d{0,3})?$/.test(cleaned)) return 0;
  return parseFloat(cleaned);
}

export function NewRecurringForm({
  tenantSlug,
  baseCurrency,
  customers,
  revenueAccounts,
}: {
  tenantSlug: string;
  baseCurrency: string;
  customers: Customer[];
  revenueAccounts: RevenueAccount[];
}) {
  const defaultAccountId = revenueAccounts[0]?.id ?? "";
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<
    "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY"
  >("MONTHLY");
  const [intervalCount, setIntervalCount] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [maxRuns, setMaxRuns] = useState("");
  const [termsDays, setTermsDays] = useState("30");
  const [currency, setCurrency] = useState(baseCurrency);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(defaultAccountId)]);

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    );
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine(defaultAccountId)]);
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  const totalDollars = useMemo(() => {
    let s = 0;
    for (const l of lines) {
      s += parseQuantityForDisplay(l.quantity) *
        parseDollarsForDisplay(l.unitPriceDollars);
    }
    return s;
  }, [lines]);

  return (
    <form
      action={createRecurringInvoice}
      className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Schedule name *
          </span>
          <input
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Monthly Retainer — Acme Corp"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Customer *</span>
          <select
            name="customerId"
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Frequency *</span>
          <div className="mt-1 flex gap-2">
            <select
              name="frequency"
              value={frequency}
              onChange={(e) =>
                setFrequency(
                  e.target.value as "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY"
                )
              }
              className="block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUALLY">Annually</option>
            </select>
            <input
              name="intervalCount"
              type="number"
              min="1"
              max="52"
              value={intervalCount}
              onChange={(e) => setIntervalCount(e.target.value)}
              className="w-20 rounded-md border-slate-300 px-2 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              title="Every N units"
            />
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            Every {intervalCount} {frequency.toLowerCase()} cycle(s)
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Day of month (monthly/quarterly/annually)
          </span>
          <input
            name="dayOfMonth"
            type="number"
            min="1"
            max="28"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            disabled={frequency === "WEEKLY"}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-slate-100"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Max 28 to avoid month-end edge cases
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Start date *</span>
          <input
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            End date (optional)
          </span>
          <input
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Max runs (optional)
          </span>
          <input
            name="maxRuns"
            type="number"
            min="1"
            value={maxRuns}
            onChange={(e) => setMaxRuns(e.target.value)}
            placeholder="Leave blank for unlimited"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Net terms (days)</span>
          <input
            name="termsDays"
            type="number"
            min="0"
            max="180"
            value={termsDays}
            onChange={(e) => setTermsDays(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Currency</span>
          <select
            name="currency"
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
        </label>

        <label className="block md:col-span-2">
          <span className="text-sm font-medium text-slate-700">Memo</span>
          <input
            name="memo"
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Optional — appears on every generated invoice"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Line template
          </h2>
          <button
            type="button"
            onClick={addLine}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            + Add line
          </button>
        </div>

        <input type="hidden" name="lineCount" value={lines.length} />

        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">
                  Revenue account
                </th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit price</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => {
                const qty = parseQuantityForDisplay(l.quantity);
                const price = parseDollarsForDisplay(l.unitPriceDollars);
                const amount = qty * price;
                return (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <input
                        name={`line_${i}_description`}
                        type="text"
                        value={l.description}
                        onChange={(e) =>
                          updateLine(i, { description: e.target.value })
                        }
                        placeholder="What is recurring"
                        className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        name={`line_${i}_accountId`}
                        value={l.accountId}
                        onChange={(e) =>
                          updateLine(i, { accountId: e.target.value })
                        }
                        className="block w-full rounded-md border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      >
                        {revenueAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`line_${i}_quantity`}
                        type="text"
                        value={l.quantity}
                        onChange={(e) =>
                          updateLine(i, { quantity: e.target.value })
                        }
                        className="w-20 rounded-md border-slate-300 px-2 py-1.5 text-right text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        name={`line_${i}_unitPrice`}
                        type="text"
                        value={l.unitPriceDollars}
                        onChange={(e) =>
                          updateLine(i, { unitPriceDollars: e.target.value })
                        }
                        placeholder="0.00"
                        className="w-28 rounded-md border-slate-300 px-2 py-1.5 text-right text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sm">
                      ${amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="text-xs text-rose-600 hover:text-rose-800"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr className="text-sm font-semibold text-slate-900">
                <td colSpan={4} className="px-3 py-2 text-right">
                  Total per run
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  ${totalDollars.toFixed(2)} {currency}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create schedule
        </button>
      </div>
    </form>
  );
}
