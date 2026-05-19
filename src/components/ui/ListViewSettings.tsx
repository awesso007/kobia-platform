"use client";

import { useState, useMemo } from "react";
import { Settings, X, Search } from "lucide-react";

export interface ListViewField {
  key: string;
  label: string;
  group?: string;
}

interface Props {
  entityLabel: string; // e.g. "Invoices", "Customers"
  fields: ListViewField[];
  defaultVisible: string[]; // keys visible by default
  storageKey: string; // localStorage key for persistence
  onChange?: (visibleKeys: string[]) => void;
}

/**
 * Bitrix24-style "List View Settings" modal — opened via gear icon on any list page.
 * Variant 2: lime APPLY pill, "Apply for all users" + "Default" link in footer,
 * "Select all / Select none" text links bottom-right, optional search.
 */
export function ListViewSettings({
  entityLabel,
  fields,
  defaultVisible,
  storageKey,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(defaultVisible);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* fall through */
    }
    return new Set(defaultVisible);
  });
  const [query, setQuery] = useState("");
  const [applyForAll, setApplyForAll] = useState(false);

  const grouped = useMemo(() => {
    const filtered = query.trim()
      ? fields.filter((f) =>
          f.label.toLowerCase().includes(query.trim().toLowerCase())
        )
      : fields;
    const groups: Record<string, ListViewField[]> = {};
    for (const f of filtered) {
      const g = f.group ?? "";
      groups[g] = groups[g] ?? [];
      groups[g]!.push(f);
    }
    return groups;
  }, [fields, query]);

  function toggle(key: string) {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisible(next);
  }

  function selectAll() {
    setVisible(new Set(fields.map((f) => f.key)));
  }

  function selectNone() {
    setVisible(new Set());
  }

  function resetDefault() {
    setVisible(new Set(defaultVisible));
  }

  function apply() {
    const keys = Array.from(visible);
    try {
      localStorage.setItem(storageKey, JSON.stringify(keys));
      if (applyForAll) {
        localStorage.setItem(`${storageKey}__global`, JSON.stringify(keys));
      }
    } catch {
      /* ignore */
    }
    onChange?.(keys);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        title="List view settings"
        aria-label="List view settings"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                List View Settings «{entityLabel}»
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search (optional but kept for usability) */}
            <div className="px-5 pt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Find field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400"
                />
              </div>
            </div>

            {/* Field grid */}
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {Object.entries(grouped).map(([groupName, items]) => (
                <div key={groupName} className="mb-4">
                  {groupName && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {groupName}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3 lg:grid-cols-4">
                    {items.map((f) => {
                      const checked = visible.has(f.key);
                      return (
                        <label
                          key={f.key}
                          className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 hover:text-slate-900"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(f.key)}
                            className="h-4 w-4 rounded border-slate-300 text-lime-500 focus:ring-1 focus:ring-lime-400"
                          />
                          <span>{f.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(grouped).length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">
                  No fields match
                </p>
              )}
            </div>

            {/* Footer — variant 2: lime APPLY, Apply-for-all + Default link, Select all/none */}
            <div className="border-t border-slate-100 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Left: actions */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={apply}
                    className="rounded-md bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-lime-300"
                  >
                    APPLY
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    CANCEL
                  </button>

                  <label className="ml-2 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={applyForAll}
                      onChange={(e) => setApplyForAll(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-lime-500 focus:ring-1 focus:ring-lime-400"
                    />
                    Apply for all users
                  </label>

                  <button
                    type="button"
                    onClick={resetDefault}
                    className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Default
                  </button>
                </div>

                {/* Right: select all / none links */}
                <div className="flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-slate-300">/</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="font-medium text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    Select none
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
