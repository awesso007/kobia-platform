"use client";

/*
 * Audit log list view: filter by entity type, action, actor, and date range
 * (all in the URL so the server page re-queries), paginated, with a click-to-open
 * side panel showing the full entry and its diff JSON.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { ENTITY_TYPES } from "@/lib/crm/record";
import { AUDIT_ACTIONS, type AuditRow } from "./types";

const ACTION_COLOR: Record<string, string> = {
  CREATE: "var(--kb-success)",
  UPDATE: "var(--kb-primary)",
  DELETE: "var(--kb-error)",
  VIEW: "var(--kb-text-secondary)",
};

export function AuditLog({
  rows,
  total,
  page,
  pageCount,
  actors,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  pageCount: number;
  actors: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<AuditRow | null>(null);

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in updates)) next.delete("page");
    router.push(`/app/settings/audit?${next.toString()}`);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect label="Entity" value={sp.get("entityType") ?? ""} options={ENTITY_TYPES.map((e) => ({ value: e, label: e }))} onChange={(v) => setParam({ entityType: v })} />
        <FilterSelect label="Action" value={sp.get("action") ?? ""} options={AUDIT_ACTIONS.map((a) => ({ value: a, label: a }))} onChange={(v) => setParam({ action: v })} />
        <FilterSelect label="Actor" value={sp.get("actor") ?? ""} options={actors.map((a) => ({ value: a, label: a }))} onChange={(v) => setParam({ actor: v })} />
        <DateInput label="From" value={sp.get("from") ?? ""} onChange={(v) => setParam({ from: v })} />
        <DateInput label="To" value={sp.get("to") ?? ""} onChange={(v) => setParam({ to: v })} />
      </div>

      <div className="overflow-hidden" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Entity</th>
              <th className="px-3 py-2 text-left font-medium">Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No audit entries match these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer" style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3"><span style={{ color: ACTION_COLOR[r.action] ?? "var(--kb-text-primary)", fontWeight: 600 }}>{r.action}</span></td>
                  <td className="px-3" style={{ color: "var(--kb-text-primary)" }}>{r.entityType} <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{r.entityId}</span></td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{r.actorEmail ?? r.actorClerkUserId ?? "system"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        <span>{total} entr{total === 1 ? "y" : "ies"} - page {page} of {pageCount}</span>
        <div className="flex gap-2">
          <KbButton variant="outline" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Previous</KbButton>
          <KbButton variant="outline" disabled={page >= pageCount} onClick={() => setParam({ page: String(page + 1) })}>Next</KbButton>
        </div>
      </div>

      {selected ? <DiffPanel entry={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function DiffPanel({ entry, onClose }: { entry: AuditRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[480px] overflow-auto p-5" style={{ backgroundColor: "var(--kb-surface)", boxShadow: "var(--kb-shadow-modal)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Audit entry</h2>
          <button type="button" onClick={onClose} style={{ color: "var(--kb-text-secondary)" }}><X size={18} /></button>
        </div>
        <dl className="space-y-2 text-sm">
          <Row label="Action" value={entry.action} />
          <Row label="Entity type" value={entry.entityType} />
          <Row label="Entity id" value={entry.entityId} />
          <Row label="Actor" value={entry.actorEmail ?? entry.actorClerkUserId ?? "system"} />
          <Row label="When" value={new Date(entry.createdAt).toLocaleString()} />
          <Row label="IP" value={entry.ip ?? "-"} />
          <Row label="User agent" value={entry.userAgent ?? "-"} />
        </dl>
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>Diff</div>
          <pre className="overflow-auto rounded p-3 text-xs" style={{ backgroundColor: "var(--kb-surface-grey)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }}>
            {entry.diff === null || entry.diff === undefined ? "(none)" : JSON.stringify(entry.diff, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{label}</dt>
      <dd style={{ color: "var(--kb-text-primary)", wordBreak: "break-word" }}>{value}</dd>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: value ? "var(--kb-text-primary)" : "var(--kb-text-secondary)" }}>
      <option value="">{label}: All</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }} />
    </label>
  );
}
