"use client";

/*
 * Onboarding form (Sprint 5). Captures company name + workspace slug, derives a
 * default slug from the company name, and calls createWorkspace. On success it
 * navigates to /app/deals for the new tenant.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { createWorkspace } from "./actions";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export function OnboardingClient() {
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const effectiveSlug = slugTouched ? slug : slugify(companyName);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createWorkspace({ slug: effectiveSlug, companyName });
      if (res.ok) {
        window.location.href = `/app/deals?tenant=${res.slug}`;
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>Company name</label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
          className="w-full rounded px-2 py-1.5 text-sm"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>Workspace URL</label>
        <div className="flex items-center gap-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          <span>/forms and CRM under</span>
          <input
            value={effectiveSlug}
            onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
            required
            className="flex-1 rounded px-2 py-1.5 text-sm"
            style={inputStyle}
          />
        </div>
      </div>

      {error && <div className="text-sm" style={{ color: "var(--kb-error)" }}>{error}</div>}

      <button
        type="submit"
        disabled={pending || !companyName.trim() || !effectiveSlug}
        className="w-full rounded px-4 py-2 text-sm text-white"
        style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)", opacity: pending ? 0.7 : 1 }}
      >
        {pending ? "Creating workspace..." : "Create workspace"}
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
