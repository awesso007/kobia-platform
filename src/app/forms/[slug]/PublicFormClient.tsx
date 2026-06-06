"use client";

/*
 * Public form renderer + submitter (Sprint 5). Renders fields from the form's
 * config, posts to /api/forms/[slug]/submit?t=<tenant>, and on success either
 * redirects (redirectUrl) or shows a thank-you message. Includes a hidden
 * honeypot field ("_hp") that real users never see or fill.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";

export type PublicFieldConfig = {
  fieldName: string;
  label?: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  required?: boolean;
  options?: string[];
};

export function PublicFormClient({
  tenantSlug,
  formSlug,
  fields,
  thankYouUrl,
  redirectUrl,
}: {
  tenantSlug: string;
  formSlug: string;
  fields: PublicFieldConfig[];
  thankYouUrl: string | null;
  redirectUrl: string | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const data = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    data.forEach((v, k) => {
      body[k] = typeof v === "string" ? v : "";
    });
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(formSlug)}/submit?t=${encodeURIComponent(tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; redirectUrl?: string | null };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Submission failed.");
        setSubmitting(false);
        return;
      }
      if (json.redirectUrl ?? redirectUrl) {
        window.location.href = (json.redirectUrl ?? redirectUrl)!;
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-sm" style={{ color: "var(--kb-text-primary)" }}>
        {thankYouUrl ? (
          <p>
            Thank you. <a href={thankYouUrl} style={{ color: "var(--kb-primary)" }}>Continue</a>
          </p>
        ) : (
          <p>Thank you. Your submission has been received.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {fields.map((f) => (
        <div key={f.fieldName}>
          <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            {f.label ?? f.fieldName}
            {f.required ? " *" : ""}
          </label>
          {f.type === "textarea" ? (
            <textarea name={f.fieldName} required={f.required} rows={4} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
          ) : f.type === "select" ? (
            <select name={f.fieldName} required={f.required} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle}>
              <option value="">Select...</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input name={f.fieldName} type={f.type ?? "text"} required={f.required} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
          )}
        </div>
      ))}

      <input type="text" name="_hp" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }} aria-hidden="true" />

      {error && <div className="text-sm" style={{ color: "var(--kb-error)" }}>{error}</div>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded px-4 py-2 text-sm text-white"
        style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)", opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--kb-surface)",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  color: "var(--kb-text-primary)",
};
