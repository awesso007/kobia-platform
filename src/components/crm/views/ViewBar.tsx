"use client";

/*
 * ViewBar (Sprint 9): the saved-view picker + column chooser that sits above a
 * list view. A SavedView captures the list's filters (the URL query string,
 * minus pagination/view bookkeeping), sort, and visible columns. Selecting a
 * view pushes its filters onto the URL so the server page re-queries; changing
 * any filter afterwards surfaces an "Unsaved filter" banner with Save-to-current
 * and Save-as-new. A Manage views modal lists every view with delete controls.
 *
 * Columns are chosen from a multi-select dropdown and persisted on the active
 * SavedView (when one is selected) or in localStorage keyed by entity. Column
 * changes are reported to the parent via onColumnsChange so the table can
 * show/hide columns.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Columns3, Plus, Settings2, Trash2 } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import {
  createSavedView,
  updateSavedView,
  deleteSavedView,
  type SavedViewEntity,
  type SavedViewRow,
} from "@/app/app/(crm)/views/actions";

export type ColumnDef = { key: string; label: string };

/* URL params that are view bookkeeping, not filters. */
const NON_FILTER_KEYS = new Set(["page", "view", "open", "sort", "dir"]);

function filtersFromParams(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp.entries()) {
    if (NON_FILTER_KEYS.has(k)) continue;
    if (v) out[k] = v;
  }
  return out;
}

function sameFilters(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  return ak.every((k, i) => k === bk[i] && String(a[k]) === String(b[bk[i]]));
}

export function ViewBar({
  entityType,
  basePath,
  views,
  columns,
  defaultColumns,
  onColumnsChange,
}: {
  entityType: SavedViewEntity;
  basePath: string;
  views: SavedViewRow[];
  columns: ColumnDef[];
  defaultColumns?: string[];
  onColumnsChange?: (visible: string[]) => void;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeViewId = sp.get("view");
  const activeView = useMemo(() => views.find((v) => v.id === activeViewId) ?? null, [views, activeViewId]);

  const currentFilters = useMemo(() => filtersFromParams(new URLSearchParams(sp.toString())), [sp]);

  const allColumnKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const colStorageKey = `kobia.columns.${entityType}`;

  const [visibleCols, setVisibleCols] = useState<string[]>(defaultColumns ?? allColumnKeys);

  // Resolve visible columns: active view's columns, else localStorage, else all.
  useEffect(() => {
    let next: string[] | null = null;
    if (activeView && activeView.columns.length > 0) {
      next = activeView.columns.filter((c) => allColumnKeys.includes(c));
    } else if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(colStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as string[];
          if (Array.isArray(parsed)) next = parsed.filter((c) => allColumnKeys.includes(c));
        }
      } catch {
        // ignore malformed storage
      }
    }
    const resolved = next && next.length > 0 ? next : defaultColumns ?? allColumnKeys;
    setVisibleCols(resolved);
    onColumnsChange?.(resolved);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [activeViewId]);

  const dirty = useMemo(() => {
    if (!activeView) return false;
    return !sameFilters(currentFilters, activeView.filters as Record<string, unknown>);
  }, [activeView, currentFilters]);

  function selectView(id: string) {
    const v = views.find((x) => x.id === id);
    if (!v) return;
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(v.filters as Record<string, unknown>)) {
      if (val != null && val !== "") next.set(k, String(val));
    }
    if (v.sortBy) {
      next.set("sort", v.sortBy);
      next.set("dir", v.sortDir.toLowerCase());
    }
    next.set("view", v.id);
    router.push(`${basePath}?${next.toString()}`);
  }

  function clearView() {
    router.push(basePath);
  }

  function persistColumns(next: string[]) {
    setVisibleCols(next);
    onColumnsChange?.(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(colStorageKey, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
    }
    if (activeView) {
      startTransition(async () => {
        await updateSavedView(activeView.id, {
          entityType,
          name: activeView.name,
          scope: activeView.scope,
          filters: activeView.filters as Record<string, unknown>,
          sortBy: activeView.sortBy,
          sortDir: activeView.sortDir,
          columns: next,
          groupBy: activeView.groupBy,
          isDefault: activeView.isDefault,
        });
        router.refresh();
      });
    }
  }

  function saveToCurrent() {
    if (!activeView) return;
    startTransition(async () => {
      await updateSavedView(activeView.id, {
        entityType,
        name: activeView.name,
        scope: activeView.scope,
        filters: currentFilters,
        sortBy: sp.get("sort"),
        sortDir: (sp.get("dir") === "asc" ? "ASC" : "DESC") as "ASC" | "DESC",
        columns: visibleCols,
        groupBy: activeView.groupBy,
        isDefault: activeView.isDefault,
      });
      router.refresh();
    });
  }

  const [naming, setNaming] = useState(false);
  const [managing, setManaging] = useState(false);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <ViewPicker views={views} activeView={activeView} onSelect={selectView} onClear={clearView} />

      <ColumnChooser columns={columns} visible={visibleCols} onChange={persistColumns} />

      <button
        type="button"
        onClick={() => setManaging(true)}
        className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-sm"
        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}
      >
        <Settings2 size={14} /> Manage views
      </button>

      {dirty ? (
        <div
          className="ml-auto inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm"
          style={{ backgroundColor: "var(--kb-surface-grey)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
        >
          <span style={{ color: "var(--kb-text-secondary)" }}>Unsaved filter</span>
          <button type="button" onClick={saveToCurrent} disabled={pending} style={{ color: "var(--kb-primary)", fontWeight: 600 }}>
            Save to current
          </button>
          <button type="button" onClick={() => setNaming(true)} disabled={pending} style={{ color: "var(--kb-primary)", fontWeight: 600 }}>
            Save as new
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1.5 text-sm"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}
        >
          <Plus size={14} /> Save view
        </button>
      )}

      {naming ? (
        <SaveAsModal
          entityType={entityType}
          basePath={basePath}
          filters={currentFilters}
          sortBy={sp.get("sort")}
          sortDir={sp.get("dir") === "asc" ? "ASC" : "DESC"}
          columns={visibleCols}
          onClose={() => setNaming(false)}
        />
      ) : null}
      {managing ? (
        <ManageViewsModal entityType={entityType} views={views} onClose={() => setManaging(false)} />
      ) : null}
    </div>
  );
}

function ViewPicker({
  views,
  activeView,
  onSelect,
  onClear,
}: {
  views: SavedViewRow[];
  activeView: SavedViewRow | null;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm"
        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)", minWidth: 160 }}
      >
        <span className="flex-1 text-left">{activeView ? activeView.name : "All records"}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div
          className="absolute left-0 z-20 mt-1 w-56 overflow-hidden rounded"
          style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", boxShadow: "var(--kb-shadow-card)" }}
        >
          <button
            type="button"
            onClick={() => { onClear(); setOpen(false); }}
            className="block w-full px-3 py-2 text-left text-sm"
            style={{ color: activeView ? "var(--kb-text-secondary)" : "var(--kb-primary)", fontWeight: activeView ? 400 : 600 }}
          >
            All records
          </button>
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => { onSelect(v.id); setOpen(false); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              style={{ color: v.id === activeView?.id ? "var(--kb-primary)" : "var(--kb-text-primary)", fontWeight: v.id === activeView?.id ? 600 : 400, borderTop: "1px solid var(--kb-border)" }}
            >
              <span>{v.name}</span>
              <span className="text-[10px] uppercase" style={{ color: "var(--kb-text-secondary)" }}>{v.scope === "TENANT" ? "Shared" : "Personal"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColumnChooser({
  columns,
  visible,
  onChange,
}: {
  columns: ColumnDef[];
  visible: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle(key: string) {
    if (visible.includes(key)) {
      const next = visible.filter((k) => k !== key);
      if (next.length === 0) return; // keep at least one column
      onChange(next);
    } else {
      // preserve declared column order when re-adding
      const next = columns.map((c) => c.key).filter((k) => visible.includes(k) || k === key);
      onChange(next);
    }
  }

  function move(key: string, dir: -1 | 1) {
    const idx = visible.indexOf(key);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= visible.length) return;
    const next = [...visible];
    const a = next[idx]!;
    const b = next[target]!;
    next[idx] = b;
    next[target] = a;
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-sm"
        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}
      >
        <Columns3 size={14} /> Columns
      </button>
      {open ? (
        <div
          className="absolute left-0 z-20 mt-1 w-60 rounded p-2"
          style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", boxShadow: "var(--kb-shadow-card)" }}
        >
          {/* Visible columns first, in order, with reorder controls. */}
          {visible.map((key) => {
            const col = columns.find((c) => c.key === key);
            if (!col) return null;
            return (
              <div key={key} className="flex items-center gap-2 px-1 py-1 text-sm">
                <input type="checkbox" checked readOnly onClick={() => toggle(key)} />
                <span className="flex-1" style={{ color: "var(--kb-text-primary)" }}>{col.label}</span>
                <button type="button" onClick={() => move(key, -1)} aria-label="Move up" style={{ color: "var(--kb-text-secondary)" }}>up</button>
                <button type="button" onClick={() => move(key, 1)} aria-label="Move down" style={{ color: "var(--kb-text-secondary)" }}>dn</button>
              </div>
            );
          })}
          {/* Hidden columns. */}
          {columns.filter((c) => !visible.includes(c.key)).map((col) => (
            <div key={col.key} className="flex items-center gap-2 px-1 py-1 text-sm">
              <input type="checkbox" checked={false} readOnly onClick={() => toggle(col.key)} />
              <span className="flex-1" style={{ color: "var(--kb-text-secondary)" }}>{col.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SaveAsModal({
  entityType,
  basePath,
  filters,
  sortBy,
  sortDir,
  columns,
  onClose,
}: {
  entityType: SavedViewEntity;
  basePath: string;
  filters: Record<string, string>;
  sortBy: string | null;
  sortDir: "ASC" | "DESC";
  columns: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PERSONAL" | "TENANT">("PERSONAL");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const id = await createSavedView({ entityType, name: trimmed, scope, filters, sortBy, sortDir, columns });
      onClose();
      const next = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) next.set(k, v);
      if (sortBy) { next.set("sort", sortBy); next.set("dir", sortDir.toLowerCase()); }
      next.set("view", id);
      router.push(`${basePath}?${next.toString()}`);
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-stretch overflow-auto sm:place-items-center sm:p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full p-5 sm:h-auto sm:max-w-sm sm:rounded" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
        <h2 className="mb-4" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Save view</h2>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Name</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Visibility</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "PERSONAL" | "TENANT")}
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
          >
            <option value="PERSONAL">Personal (only me)</option>
            <option value="TENANT">Shared (everyone)</option>
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={submit} disabled={pending || !name.trim()}>{pending ? "Saving..." : "Save view"}</KbButton>
        </div>
      </div>
    </div>
  );
}

function ManageViewsModal({
  entityType,
  views,
  onClose,
}: {
  entityType: SavedViewEntity;
  views: SavedViewRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      await deleteSavedView(id, entityType);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-stretch overflow-auto sm:place-items-center sm:p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full p-5 sm:h-auto sm:max-w-md sm:rounded" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
        <h2 className="mb-4" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Manage views</h2>
        {views.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No saved views yet.</p>
        ) : (
          <ul className="space-y-2">
            {views.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 rounded px-3 py-2"
                style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
              >
                <div>
                  <div className="text-sm" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{v.name}</div>
                  <div className="text-[11px] uppercase" style={{ color: "var(--kb-text-secondary)" }}>{v.scope === "TENANT" ? "Shared" : "Personal"}</div>
                </div>
                <button type="button" onClick={() => remove(v.id)} disabled={pending} aria-label={`Delete ${v.name}`} style={{ color: "var(--kb-error)" }}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex justify-end">
          <KbButton variant="outline" onClick={onClose}>Close</KbButton>
        </div>
      </div>
    </div>
  );
}
