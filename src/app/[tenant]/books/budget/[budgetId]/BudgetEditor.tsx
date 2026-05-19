"use client";

import { useMemo, useState } from "react";
import { saveBudgetLines } from "@/app/actions/budget-actions";

type Account = { id: string; code: string; name: string; type: string };

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;
type MonthKey = (typeof MONTHS)[number];
const MONTH_LABELS: Record<MonthKey, string> = {
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr",
  may: "May", jun: "Jun", jul: "Jul", aug: "Aug",
  sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
};

type Row = Record<MonthKey, string>;

function centsStringToDollars(centsStr: string): string {
  try {
    const c = BigInt(centsStr || "0");
    if (c === 0n) return "";
    const negative = c < 0n;
    const abs = negative ? -c : c;
    const whole = abs / 100n;
    const frac = abs % 100n;
    return `${negative ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function parseDollars(s: string): number {
  const cleaned = s.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return 0;
  return parseFloat(cleaned);
}

export function BudgetEditor({
  tenantSlug,
  budgetId,
  accounts,
  existingLines,
}: {
  tenantSlug: string;
  budgetId: string;
  accounts: Account[];
  existingLines: Record<string, Record<MonthKey, string>>;
}) {
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const init: Record<string, Row> = {};
    for (const a of accounts) {
      const existing = existingLines[a.id];
      init[a.id] = MONTHS.reduce((acc, m) => {
        acc[m] = existing ? centsStringToDollars(existing[m]) : "";
        return acc;
      }, {} as Row);
    }
    return init;
  });

  function updateCell(accountId: string, m: MonthKey, value: string) {
    setRows((prev) => {
      const existing: Row = prev[accountId] ?? MONTHS.reduce((acc, mm) => {
        acc[mm] = "";
        return acc;
      }, {} as Row);
      const updated: Row = { ...existing, [m]: value };
      return { ...prev, [accountId]: updated };
    });
  }

  function spreadEvenly(accountId: string, totalStr: string) {
    const total = parseDollars(totalStr);
    if (total === 0) return;
    const per = (total / 12).toFixed(2);
    setRows((prev) => ({
      ...prev,
      [accountId]: MONTHS.reduce((acc, m) => {
        acc[m] = per;
        return acc;
      }, {} as Row),
    }));
  }

  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const accId of Object.keys(rows)) {
      const row = rows[accId];
      if (!row) { totals[accId] = 0; continue; }
      totals[accId] = MONTHS.reduce(
        (s, m) => s + parseDollars(row[m] ?? ""),
        0
      );
    }
    return totals;
  }, [rows]);

  const monthTotals = useMemo(() => {
    return MONTHS.map((m) =>
      Object.keys(rows).reduce((s, accId) => s + parseDollars(rows[accId]?.[m] ?? ""), 0)
    );
  }, [rows]);

  const grandTotal = monthTotals.reduce((s, x) => s + x, 0);

  return (
    <form
      action={saveBudgetLines}
      className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="accountCount" value={accounts.length} />

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 text-left font-medium sticky left-0 bg-slate-50">
                Account
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="px-2 py-2 text-right font-medium">
                  {MONTH_LABELS[m]}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">YTD</th>
              <th className="px-2 py-2 text-left font-medium">Spread</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((a, i) => (
              <tr key={a.id}>
                <td className="px-2 py-1.5 text-slate-700 sticky left-0 bg-white">
                  <input
                    type="hidden"
                    name={`row_${i}_accountId`}
                    value={a.id}
                  />
                  <span className="font-mono text-slate-500">{a.code}</span>{" "}
                  <span className="font-medium">{a.name}</span>
                </td>
                {MONTHS.map((m) => (
                  <td key={m} className="px-1 py-1">
                    <input
                      name={`row_${i}_${m}`}
                      type="text"
                      value={rows[a.id]?.[m] ?? ""}
                      onChange={(e) => updateCell(a.id, m, e.target.value)}
                      placeholder="0"
                      className="w-20 rounded border-slate-300 px-1.5 py-1 text-right text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-700">
                  ${rowTotals[a.id]?.toFixed(2) ?? "0.00"}
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    placeholder="Total ÷ 12"
                    onBlur={(e) => {
                      if (e.target.value) {
                        spreadEvenly(a.id, e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="w-20 rounded border-slate-300 px-1.5 py-1 text-right text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold text-slate-900">
            <tr>
              <td className="px-2 py-2 sticky left-0 bg-slate-50">Total</td>
              {monthTotals.map((t, i) => (
                <td key={i} className="px-2 py-2 text-right font-mono tabular-nums">
                  ${t.toFixed(2)}
                </td>
              ))}
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                ${grandTotal.toFixed(2)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between p-4">
        <p className="text-xs text-slate-500">
          Enter dollar amounts. Use the &ldquo;Spread&rdquo; column to split a
          yearly total evenly across all 12 months.
        </p>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save budget
        </button>
      </div>
    </form>
  );
}
