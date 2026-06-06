"use client";

/*
 * Web forms manager (Sprint 5). Lists forms, opens a builder to create/edit a
 * form (name, slug, dynamic field rows, thank-you / redirect URLs), and shows
 * the public URL + embed snippets (iframe and JS fetch) for each form.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { createWebForm, updateWebForm, deleteWebForm, type WebFormField } from "./actions";

export type WebFormRow = {
  id: string;
  name: string;
  slug: string;
  fields: WebFormField[];
  thankYouUrl: string | null;
  redirectUrl: string | null;
};

const FIELD_TYPES: WebFormField["type"][] = ["text", "email", "tel", "textarea", "select"];

function publicUrl(origin: string, slug: string, tenant: string): string {
  return `${origin}/forms/${slug}?t=${tenant}`;
}

function iframeSnippet(url: string): string {
  return `<iframe src="${url}" style="width:100%;max-width:520px;height:600px;border:0" title="Contact form"></iframe>`;
}

function jsSnippet(origin: string, slug: string, tenant: string): string {
  const endpoint = `${origin}/api/forms/${slug}/submit?t=${tenant}`;
  return [
    `<form id="kobia-${slug}">`,
    `  <input name="name" placeholder="Name" required />`,
    `  <input name="email" type="email" placeholder="Email" required />`,
    `  <button type="submit">Submit</button>`,
    `</form>`,
    `<script>`,
    `  document.getElementById("kobia-${slug}").addEventListener("submit", async (e) => {`,
    `    e.preventDefault();`,
    `    const data = Object.fromEntries(new FormData(e.target));`,
    `    await fetch("${endpoint}", {`,
    `      method: "POST",`,
    `      headers: { "Content-Type": "application/json" },`,
    `      body: JSON.stringify(data),`,
    `    });`,
    `    e.target.reset();`,
    `  });`,
    `</script>`,
  ].join("\n");
}

const EMPTY: WebFormRow = { id: "", name: "", slug: "", fields: [{ fieldName: "name", label: "Name", type: "text", required: true }], thankYouUrl: null, redirectUrl: null };

export function FormsClient({ rows, tenantSlug, origin }: { rows: WebFormRow[]; tenantSlug: string; origin: string }) {
  const [editing, setEditing] = useState<WebFormRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function save(form: WebFormRow) {
    setError(null);
    start(async () => {
      const payload = {
        name: form.name,
        slug: form.slug,
        fields: form.fields,
        thankYouUrl: form.thankYouUrl,
        redirectUrl: form.redirectUrl,
      };
      const res = form.id ? await updateWebForm(form.id, payload) : await createWebForm(payload);
      if (res.ok) setEditing(null);
      else setError(res.error ?? "Could not save form.");
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteWebForm(id);
    });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => { setEditing({ ...EMPTY }); setError(null); }}
          className="rounded px-3 py-1.5 text-sm text-white"
          style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          New form
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded p-6 text-sm" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", color: "var(--kb-text-secondary)" }}>
          No web forms yet. Create one to capture leads from your website.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((f) => (
            <div key={f.id} className="rounded p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div style={{ fontWeight: 600 }}>{f.name}</div>
                  <a href={publicUrl(origin, f.slug, tenantSlug)} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--kb-primary)" }}>
                    {publicUrl(origin, f.slug, tenantSlug)}
                  </a>
                  <div className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{f.fields.length} field(s)</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditing({ ...f }); setError(null); }} className="rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>Edit</button>
                  <button type="button" onClick={() => remove(f.id)} className="rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-error)" }}>Delete</button>
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm" style={{ color: "var(--kb-text-secondary)" }}>Embed snippets</summary>
                <div className="mt-2 space-y-2">
                  <SnippetBox label="iframe" code={iframeSnippet(publicUrl(origin, f.slug, tenantSlug))} />
                  <SnippetBox label="JS fetch" code={jsSnippet(origin, f.slug, tenantSlug)} />
                </div>
              </details>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <FormBuilder
          value={editing}
          error={error}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={() => save(editing)}
        />
      )}
    </div>
  );
}

function SnippetBox({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{label}</div>
      <textarea readOnly value={code} rows={code.split("\n").length} className="w-full rounded p-2 text-xs font-mono" style={{ backgroundColor: "var(--kb-surface-grey)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
    </div>
  );
}

function FormBuilder({
  value,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  value: WebFormRow;
  error: string | null;
  onChange: (v: WebFormRow) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function setField(i: number, patch: Partial<WebFormField>) {
    onChange({ ...value, fields: value.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  }
  function addField() {
    onChange({ ...value, fields: [...value.fields, { fieldName: "", label: "", type: "text", required: false }] });
  }
  function removeField(i: number) {
    onChange({ ...value, fields: value.fields.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-lg rounded p-5" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 className="mb-3" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600 }}>{value.id ? "Edit form" : "New form"}</h3>

        <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>Name</label>
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="mb-3 w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />

        <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>Slug</label>
        <input value={value.slug} onChange={(e) => onChange({ ...value, slug: e.target.value })} placeholder="contact" className="mb-3 w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />

        <div className="mb-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>Fields</div>
        <div className="mb-3 space-y-2">
          {value.fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={f.fieldName} onChange={(e) => setField(i, { fieldName: e.target.value })} placeholder="fieldName" className="w-28 rounded px-2 py-1 text-sm" style={inputStyle} />
              <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Label" className="flex-1 rounded px-2 py-1 text-sm" style={inputStyle} />
              <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as WebFormField["type"] })} className="rounded px-1 py-1 text-sm" style={inputStyle}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> req
              </label>
              <button type="button" onClick={() => removeField(i)} className="text-sm" style={{ color: "var(--kb-error)" }}>x</button>
            </div>
          ))}
          <button type="button" onClick={addField} className="text-sm" style={{ color: "var(--kb-primary)" }}>+ Add field</button>
        </div>

        <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>Thank-you URL (optional)</label>
        <input value={value.thankYouUrl ?? ""} onChange={(e) => onChange({ ...value, thankYouUrl: e.target.value })} className="mb-3 w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />

        <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>Redirect URL after submit (optional)</label>
        <input value={value.redirectUrl ?? ""} onChange={(e) => onChange({ ...value, redirectUrl: e.target.value })} className="mb-3 w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />

        {error && <div className="mb-2 text-sm" style={{ color: "var(--kb-error)" }}>{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>Cancel</button>
          <button type="button" onClick={onSave} className="rounded px-3 py-1.5 text-sm text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--kb-surface)",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  color: "var(--kb-text-primary)",
};
