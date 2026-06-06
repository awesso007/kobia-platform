"use client";

/*
 * Workspace settings form (Sprint 5). Edit display name, theme colors (primary
 * + accent), default timezone, and logo URL. Saving persists to tenant_registry
 * and revalidates the CRM layout so the new theme applies.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { updateWorkspace } from "./actions";

export type WorkspaceSummary = {
  slug: string;
  displayName: string;
  primary: string;
  accent: string;
  timezone: string;
  logoUrl: string;
};

export function WorkspaceClient({ summary }: { summary: WorkspaceSummary }) {
  const [state, setState] = useState(summary);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof WorkspaceSummary>(key: K, value: WorkspaceSummary[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function save() {
    setNotice(null);
    setError(null);
    start(async () => {
      const res = await updateWorkspace({
        displayName: state.displayName,
        primary: state.primary,
        accent: state.accent,
        timezone: state.timezone,
        logoUrl: state.logoUrl,
      });
      if (res.ok) setNotice("Workspace settings saved.");
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded p-4" style={cardStyle}>
        <Field label="Workspace URL (slug)">
          <input value={state.slug} readOnly disabled className="w-full rounded px-2 py-1.5 text-sm" style={{ ...inputStyle, opacity: 0.7 }} />
          <div className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>The slug is fixed - it identifies your data schema.</div>
        </Field>

        <Field label="Display name">
          <input value={state.displayName} onChange={(e) => set("displayName", e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Primary color">
            <div className="flex items-center gap-2">
              <input type="color" value={state.primary} onChange={(e) => set("primary", e.target.value)} style={{ width: "40px", height: "32px", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
              <input value={state.primary} onChange={(e) => set("primary", e.target.value)} className="flex-1 rounded px-2 py-1.5 text-sm font-mono" style={inputStyle} />
            </div>
          </Field>
          <Field label="Accent color">
            <div className="flex items-center gap-2">
              <input type="color" value={state.accent} onChange={(e) => set("accent", e.target.value)} style={{ width: "40px", height: "32px", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
              <input value={state.accent} onChange={(e) => set("accent", e.target.value)} className="flex-1 rounded px-2 py-1.5 text-sm font-mono" style={inputStyle} />
            </div>
          </Field>
        </div>

        <Field label="Default timezone">
          <input value={state.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="e.g. America/New_York" className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
        </Field>

        <Field label="Logo URL">
          <input value={state.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://..." className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
        </Field>
      </div>

      {notice && <div className="text-sm" style={{ color: "var(--kb-success)" }}>{notice}</div>}
      {error && <div className="text-sm" style={{ color: "var(--kb-error)" }}>{error}</div>}

      <button type="button" onClick={save} disabled={pending} className="rounded px-4 py-2 text-sm text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)", opacity: pending ? 0.7 : 1 }}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--kb-surface)",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius)",
};

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--kb-surface)",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  color: "var(--kb-text-primary)",
};
