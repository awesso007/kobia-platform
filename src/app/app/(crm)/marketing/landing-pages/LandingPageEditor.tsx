"use client";

/*
 * Landing page editor (Sprint 13). Edits slug, title, HTML/CSS, and meta tags,
 * then publishes to /p/<slug>. Used for both create and edit. A live preview
 * frame renders the HTML + CSS via srcDoc.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLandingPage, updateLandingPage, deleteLandingPage, publishLandingPageAction } from "../actions";
import { PageHeader, Card, MarketingBadge } from "../MarketingUI";

export function LandingPageEditor({
  page,
  tenantSlug,
}: {
  page?: {
    id: string;
    slug: string;
    title: string;
    status: string;
    htmlContent: string;
    cssContent: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    ogImage: string | null;
  };
  tenantSlug: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [slug, setSlug] = useState(page?.slug ?? "");
  const [title, setTitle] = useState(page?.title ?? "");
  const [html, setHtml] = useState(page?.htmlContent ?? "<h1>Welcome</h1>\n<p>Edit this content.</p>");
  const [css, setCss] = useState(page?.cssContent ?? "body { font-family: sans-serif; padding: 40px; }");
  const [metaTitle, setMetaTitle] = useState(page?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(page?.metaDescription ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function payload() {
    return {
      slug,
      title,
      htmlContent: html,
      cssContent: css || null,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      ogImage: page?.ogImage ?? null,
      formId: null,
    };
  }

  function save() {
    setError(null);
    setInfo(null);
    start(async () => {
      try {
        if (page) {
          await updateLandingPage(page.id, payload());
          setInfo("Saved.");
          router.refresh();
        } else {
          const id = await createLandingPage(payload());
          router.push(`/app/marketing/landing-pages/${id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save page.");
      }
    });
  }

  function togglePublish(publish: boolean) {
    if (!page) return;
    setError(null);
    setInfo(null);
    start(async () => {
      try {
        await updateLandingPage(page.id, payload());
        await publishLandingPageAction(page.id, publish);
        setInfo(publish ? "Published." : "Unpublished.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change publish state.");
      }
    });
  }

  function remove() {
    if (!page) return;
    if (!confirm("Delete this landing page?")) return;
    start(async () => {
      await deleteLandingPage(page.id);
      router.push("/app/marketing/landing-pages");
    });
  }

  const previewDoc = `<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`;
  const publicUrl = page && page.status === "PUBLISHED" ? `/p/${page.slug}?t=${tenantSlug}` : null;

  return (
    <div className="p-6">
      <PageHeader
        title={page ? "Landing page" : "New landing page"}
        subtitle="Static HTML and CSS, served at /p/<slug> when published."
        action={
          <div className="flex items-center gap-2">
            {page ? <MarketingBadge value={page.status} /> : null}
            {page ? (
              <button
                onClick={remove}
                disabled={pending}
                className="rounded px-3 py-1.5 text-sm font-medium"
                style={{ color: "var(--kb-error)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
              >
                Delete
              </button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="mb-4 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#d9534f1a", color: "var(--kb-error)" }}>
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="mb-4 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#5cb85c1a", color: "var(--kb-success)" }}>
          {info}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Welcome" />
            </Field>
            <Field label="Slug">
              <input value={slug} onChange={(e) => setSlug(e.target.value)} style={inputStyle} placeholder="welcome" />
            </Field>
          </div>
          <Field label="HTML">
            <textarea value={html} onChange={(e) => setHtml(e.target.value)} style={{ ...inputStyle, minHeight: 160, fontFamily: "monospace" }} />
          </Field>
          <Field label="CSS">
            <textarea value={css} onChange={(e) => setCss(e.target.value)} style={{ ...inputStyle, minHeight: 100, fontFamily: "monospace" }} />
          </Field>
          <Field label="Meta title">
            <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Meta description">
            <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} style={inputStyle} />
          </Field>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={pending}
              className="rounded px-4 py-2 text-sm font-medium"
              style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              {page ? "Save" : "Create page"}
            </button>
            {page && page.status !== "PUBLISHED" ? (
              <button
                onClick={() => togglePublish(true)}
                disabled={pending}
                className="rounded px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
              >
                Publish
              </button>
            ) : null}
            {page && page.status === "PUBLISHED" ? (
              <button
                onClick={() => togglePublish(false)}
                disabled={pending}
                className="rounded px-4 py-2 text-sm font-medium"
                style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
              >
                Unpublish
              </button>
            ) : null}
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: "var(--kb-primary)" }}>
                View live
              </a>
            ) : null}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-4 py-2 text-xs font-medium" style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}>
            Preview
          </div>
          <iframe title="preview" srcDoc={previewDoc} style={{ width: "100%", height: 520, border: "none", backgroundColor: "#fff" }} />
        </Card>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "14px",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  backgroundColor: "var(--kb-surface)",
  color: "var(--kb-text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
