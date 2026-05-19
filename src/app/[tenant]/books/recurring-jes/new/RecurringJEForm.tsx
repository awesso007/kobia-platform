"use client";

import { useMemo, useState } from "react";
import { createRecurringJEAction } from "@/app/actions/recurring-je-actions";

type AccountOpt = { id: string; code: string; name: string; type: string };

type Line = {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
  classTag: string;
  locationTag: string;
  departmentTag: string;
};

const emptyLine: Line = {
  accountId: "",
  debit: "",
  credit: "",
  memo: "",
  classTag: "",
  locationTag: "",
  departmentTag: "",
};

function parseDollars(s: string): number {
  const cleaned = (s || "").trim().replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export default function RecurringJEForm({
  tenantSlug,
  accounts,
  defaultRunDate,
}: {
  tenantSlug: string;
  accounts: AccountOpt[];
  defaultRunDate: string;
}) {
  const [lines, setLines] = useState<Line[]>([
    { ...emptyLine },
    { ...emptyLine },
  ]);

  const totals = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const l of lines) {
      d += parseDollars(l.debit);
      c += parseDollars(l.credit);
    }
    return { debit: d, credit: c, diff: +(d - c).toFixed(2) };
  }, [lines]);

  function update(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const balanced = totals.diff === 0 && totals.debit > 0;

  return (
    <form action={createRecurringJEAction} className="space-y-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Name *</span>
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Monthly depreciation — vehicles"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Frequency *</span>
          <select
            name="frequency"
            defaultValue="MONTHLY"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUALLY">Annually</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">First run date *</span>
          <input
            type="date"
            name="nextRunDate"
            required
            defaultValue={defaultRunDate}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">End date (optional)</span>
          <input
            type="date"
            name="endDate"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-medium text-slate-700">
            Description (shown on each posted entry)
          </span>
          <input
            name="description"
            maxLength={200}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-medium text-slate-700">Memo (optional)</span>
          <input
            name="memo"
            maxLength={500}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Template lines</h2>
          <button
            type="button"
            onClick={addLine}
            className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            + Add line
          </button>
        </div>

        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Account</th>
                <th className="px-2 py-1.5 text-right font-medium">Debit</th>
                <th className="px-2 py-1.5 text-right font-medium">Credit</th>
                <th className="px-2 py-1.5 font-medium">Memo</th>
                <th className="px-2 py-1.5 font-medium">Class</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <select
                      name="line_account"
                      value={l.accountId}
                      onChange={(e) => update(idx, { accountId: e.target.value })}
                      required
                      className="w-full rounded-md border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">Choose…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      name="line_debit"
                      value={l.debit}
                      onChange={(e) =>
                        update(idx, {
                          debit: e.target.value,
                          ...(e.target.value ? { credit: "" } : {}),
                        })
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-24 rounded-md border-slate-300 px-2 py-1 text-right text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      name="line_credit"
                      value={l.credit}
                      onChange={(e) =>
                        update(idx, {
                          credit: e.target.value,
                          ...(e.target.value ? { debit: "" } : {}),
                        })
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-24 rounded-md border-slate-300 px-2 py-1 text-right text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      name="line_memo"
                      value={l.memo}
                      onChange={(e) => update(idx, { memo: e.target.value })}
                      maxLength={200}
                      className="w-full rounded-md border-slate-300 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      name="line_class"
                      value={l.classTag}
                      onChange={(e) => update(idx, { classTag: e.target.value })}
                      maxLength={50}
                      placeholder="optional"
                      className="w-full rounded-md border-slate-300 px-2 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {/* hidden location + department to keep parallel arrays aligned */}
                    <input
                      type="hidden"
                      name="line_location"
                      value={l.locationTag}
                    />
                    <input
                      type="hidden"
                      name="line_department"
                      value={l.departmentTag}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 2}
                      className="rounded text-xs text-rose-600 disabled:text-slate-300"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50 text-xs">
                <td className="px-2 py-1.5 font-medium text-slate-600">Totals</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  ${totals.debit.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  ${totals.credit.toFixed(2)}
                </td>
                <td className="px-2 py-1.5" colSpan={3}>
                  {totals.debit === 0 && totals.credit === 0 ? (
                    <span className="text-slate-400">Enter at least 2 lines.</span>
                  ) : totals.diff === 0 ? (
                    <span className="text-emerald-700">Balanced ✓</span>
                  ) : (
                    <span className="text-rose-700">
                      Unbalanced by ${Math.abs(totals.diff).toFixed(2)}.
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={!balanced}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Save template
        </button>
      </div>
    </form>
  );
}
