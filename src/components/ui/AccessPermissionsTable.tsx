"use client";

import { useState, useMemo } from "react";
import { Plus, Copy, ChevronDown } from "lucide-react";

export interface PermissionOption {
  value: string;
  label: string;
}

export interface PermissionRow {
  key: string;
  label: string;
  /** Optional override for the dropdown options shown on this row */
  options?: PermissionOption[];
}

export interface PermissionSection {
  key: string;
  title: string;
  rows: PermissionRow[];
}

export interface PermissionRole {
  key: string;
  label: string;
}

interface Props {
  roles: PermissionRole[];
  sections: PermissionSection[];
  defaultOptions?: PermissionOption[];
  /** Initial value: { [sectionKey]: { [rowKey]: { [roleKey]: { value, on } } } } */
  initial?: Record<
    string,
    Record<string, Record<string, { value: string; on: boolean }>>
  >;
  onCreateRole?: () => void;
  onCloneRole?: () => void;
  onChange?: (
    state: Record<
      string,
      Record<string, Record<string, { value: string; on: boolean }>>
    >
  ) => void;
}

const DEFAULT_OPTIONS: PermissionOption[] = [
  { value: "ALL", label: "All items" },
  { value: "PERSONAL", label: "Personal only" },
  { value: "NONE", label: "None" },
];

/**
 * Bitrix24-style Access Permissions roles table.
 * - Header row with role pills
 * - Sections (e.g. "Customer documents", "HR documents", "Access permissions")
 * - Each row: permission label + per-role dropdown + toggle switch
 */
export function AccessPermissionsTable({
  roles,
  sections,
  defaultOptions = DEFAULT_OPTIONS,
  initial,
  onCreateRole,
  onCloneRole,
  onChange,
}: Props) {
  const [state, setState] = useState(() => {
    if (initial) return initial;
    const next: Record<
      string,
      Record<string, Record<string, { value: string; on: boolean }>>
    > = {};
    for (const s of sections) {
      next[s.key] = {};
      for (const r of s.rows) {
        next[s.key]![r.key] = {};
        for (const role of roles) {
          next[s.key]![r.key]![role.key] = {
            value: defaultOptions[0]?.value ?? "ALL",
            on: true,
          };
        }
      }
    }
    return next;
  });

  function update(
    sectionKey: string,
    rowKey: string,
    roleKey: string,
    patch: Partial<{ value: string; on: boolean }>
  ) {
    setState((prev) => {
      const next = { ...prev };
      next[sectionKey] = { ...(next[sectionKey] ?? {}) };
      next[sectionKey]![rowKey] = { ...(next[sectionKey]![rowKey] ?? {}) };
      next[sectionKey]![rowKey]![roleKey] = {
        ...(next[sectionKey]![rowKey]![roleKey] ?? {
          value: defaultOptions[0]?.value ?? "ALL",
          on: true,
        }),
        ...patch,
      };
      onChange?.(next);
      return next;
    });
  }

  const colWidth = useMemo(() => `${Math.max(180, 720 / roles.length)}px`, [
    roles.length,
  ]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Header bar */}
      <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-3">
        <span className="text-sm font-semibold text-slate-900">Roles</span>
        <button
          type="button"
          onClick={onCreateRole}
          className="flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Create role
        </button>
        <button
          type="button"
          onClick={onCloneRole}
          className="flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
        >
          <Copy className="h-3.5 w-3.5" />
          Clone role
        </button>
      </div>

      {/* Role pills row */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex-1" />
        {roles.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-center rounded-full bg-cyan-100 px-4 py-1.5 text-sm font-medium text-slate-700"
            style={{ minWidth: colWidth }}
          >
            {r.label}
          </div>
        ))}
      </div>

      {/* Sections */}
      <div>
        {sections.map((section) => (
          <div key={section.key} className="border-b border-slate-100 last:border-b-0">
            <div className="bg-slate-50/60 px-5 py-2.5">
              <h3 className="text-sm font-semibold text-slate-800">
                {section.title}
              </h3>
            </div>
            <div>
              {section.rows.map((row, idx) => {
                const options = row.options ?? defaultOptions;
                return (
                  <div
                    key={row.key}
                    className={`flex items-center gap-3 px-5 py-2.5 ${
                      idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"
                    }`}
                  >
                    <div className="flex-1 text-sm text-slate-700">{row.label}</div>
                    {roles.map((role) => {
                      const cell =
                        state[section.key]?.[row.key]?.[role.key] ?? {
                          value: options[0]?.value ?? "ALL",
                          on: true,
                        };
                      return (
                        <div
                          key={role.key}
                          className="flex items-center justify-between gap-2"
                          style={{ minWidth: colWidth }}
                        >
                          <div className="relative flex-1">
                            <select
                              value={cell.value}
                              onChange={(e) =>
                                update(section.key, row.key, role.key, {
                                  value: e.target.value,
                                })
                              }
                              className="w-full appearance-none rounded-md border border-slate-200 bg-white py-1.5 pl-3 pr-7 text-sm text-slate-700 hover:border-slate-300 focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400"
                            >
                              {options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              update(section.key, row.key, role.key, {
                                on: !cell.on,
                              })
                            }
                            role="switch"
                            aria-checked={cell.on}
                            className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                              cell.on ? "bg-lime-400" : "bg-slate-300"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                                cell.on ? "left-[18px]" : "left-0.5"
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
