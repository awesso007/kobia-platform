"use client";

/*
 * Run-history slide-in panel for one automation: a table of recent runs with
 * status, duration, target entity, and an expandable list of executed actions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useState } from "react";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/crm/ui";
import type { AutomationRow, AutomationRunRow } from "./queries";
import { loadAutomationRuns } from "./actions";

export function RunHistory({ automation, onClose }: { automation: AutomationRow; onClose: () => void }) {
  const [runs, setRuns] = useState<AutomationRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAutomationRuns(automation.id).then((data) => {
      if (active) {
        setRuns(data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [automation.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[520px] overflow-auto p-5" style={{ backgroundColor: "var(--kb-surface)", boxShadow: "var(--kb-shadow-modal)" }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Run history</h2>
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>{automation.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: "var(--kb-text-secondary)" }}><X size={18} /></button>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading...</p>
        ) : runs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No runs recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => {
              const expanded = open === r.id;
              const executed = Array.isArray(r.actionsExecuted) ? (r.actionsExecuted as { kind: string; status: string; detail?: string }[]) : [];
              return (
                <li key={r.id} className="rounded p-3" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
                  <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="flex w-full items-center justify-between gap-2 text-left">
                    <span className="flex items-center gap-2">
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <StatusBadge value={r.status} />
                      <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{r.entityType} {r.entityId ? r.entityId.slice(0, 8) : ""}</span>
                    </span>
                    <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                      {new Date(r.startedAt).toLocaleString()}{r.durationMs !== null ? ` - ${r.durationMs}ms` : ""}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="mt-2 pl-5">
                      {r.error ? <p className="text-xs" style={{ color: "var(--kb-error)" }}>{r.error}</p> : null}
                      {executed.length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>No actions executed.</p>
                      ) : (
                        <ul className="space-y-1">
                          {executed.map((a, i) => (
                            <li key={i} className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                              <span style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>{a.kind}</span> - {a.status}{a.detail ? `: ${a.detail}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
