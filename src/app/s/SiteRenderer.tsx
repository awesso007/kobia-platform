/*
 * Public site block renderer (Sprint 17, server component). Takes a page and its
 * blocks and renders each by type, with the site's theme applied as CSS custom
 * properties on the root element. Pure presentational; no client interactivity
 * beyond the small TrackBeacon (a client island) for analytics.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { CSSProperties } from "react";
import { resolveThemeTokens, themeToCssVars } from "@/lib/sites/site-utils";
import type { BlockData, FeatureItem, FaqItem, GalleryImage } from "@/lib/sites/blocks";
import { TrackBeacon } from "./TrackBeacon";

type RenderBlock = { id: string; type: string; visible: boolean; data: unknown };
type RenderPage = { id: string; title: string; seoTitle: string | null; blocks: RenderBlock[] };
type RenderSite = { id: string; name: string; slug: string; theme: unknown };

export function SiteRenderer({ site, page, tenantSlug }: { site: RenderSite; page: RenderPage; tenantSlug: string }) {
  const tokens = resolveThemeTokens(site.theme);
  const rootStyle = { ...themeToCssVars(tokens), backgroundColor: "var(--site-bg)", color: "var(--site-fg)", fontFamily: "var(--site-font-body)", minHeight: "100vh" } as CSSProperties;

  return (
    <div style={rootStyle}>
      <TrackBeacon siteId={site.id} pageId={page.id} tenantSlug={tenantSlug} />
      {page.blocks
        .filter((b) => b.visible)
        .map((b) => (
          <Block key={b.id} type={b.type} data={(b.data ?? {}) as BlockData} />
        ))}
      <footer style={{ padding: "32px 24px", textAlign: "center", color: "var(--site-muted)", fontSize: 13 }}>
        {site.name}
      </footer>
    </div>
  );
}

const section: CSSProperties = { padding: "var(--site-section) 24px", maxWidth: 1080, margin: "0 auto" };
const heading: CSSProperties = { fontFamily: "var(--site-font-heading)", margin: 0 };

function Button({ label, href }: { label?: string; href?: string }) {
  if (!label) return null;
  return (
    <a
      href={href || "#"}
      style={{
        display: "inline-block",
        marginTop: 16,
        padding: "10px 20px",
        backgroundColor: "var(--site-primary)",
        color: "#fff",
        borderRadius: "var(--site-radius)",
        textDecoration: "none",
        fontWeight: 600,
      }}
    >
      {label}
    </a>
  );
}

function Block({ type, data }: { type: string; data: BlockData }) {
  switch (type) {
    case "HERO":
      return (
        <section style={{ ...section, textAlign: "center" }}>
          <h1 style={{ ...heading, fontSize: 44, fontWeight: 800 }}>{data.title}</h1>
          {data.subtitle ? <p style={{ fontSize: 18, color: "var(--site-muted)", marginTop: 12 }}>{data.subtitle}</p> : null}
          <Button label={data.buttonLabel} href={data.buttonHref} />
        </section>
      );
    case "TEXT":
      return (
        <section style={{ ...section, textAlign: data.align ?? "left" }}>
          <p style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{data.body}</p>
        </section>
      );
    case "IMAGE":
      return (
        <section style={section}>
          {data.url ? <img src={data.url} alt={data.alt ?? ""} style={{ width: "100%", borderRadius: "var(--site-radius)" }} /> : null}
          {data.caption ? <p style={{ textAlign: "center", color: "var(--site-muted)", marginTop: 8, fontSize: 13 }}>{data.caption}</p> : null}
        </section>
      );
    case "CTA":
      return (
        <section style={{ ...section, textAlign: "center", backgroundColor: "var(--site-accent)", color: "#fff", maxWidth: "none" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <h2 style={{ ...heading, fontSize: 30, fontWeight: 700 }}>{data.title}</h2>
            {data.subtitle ? <p style={{ marginTop: 8 }}>{data.subtitle}</p> : null}
            <Button label={data.buttonLabel} href={data.buttonHref} />
          </div>
        </section>
      );
    case "FEATURES":
      return (
        <section style={section}>
          {data.title ? <h2 style={{ ...heading, fontSize: 30, fontWeight: 700, textAlign: "center", marginBottom: 24 }}>{data.title}</h2> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            {(data.features ?? []).map((f: FeatureItem, i: number) => (
              <div key={i} style={{ padding: 20, border: "1px solid var(--site-muted)", borderRadius: "var(--site-radius)" }}>
                <h3 style={{ ...heading, fontSize: 18, fontWeight: 700 }}>{f.title}</h3>
                <p style={{ color: "var(--site-muted)", marginTop: 8 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "TESTIMONIAL":
      return (
        <section style={{ ...section, textAlign: "center" }}>
          <blockquote style={{ fontSize: 22, fontStyle: "italic", margin: 0 }}>{data.quote}</blockquote>
          <p style={{ marginTop: 12, fontWeight: 600 }}>
            {data.author}
            {data.role ? <span style={{ color: "var(--site-muted)", fontWeight: 400 }}> - {data.role}</span> : null}
          </p>
        </section>
      );
    case "FAQ":
      return (
        <section style={section}>
          {data.title ? <h2 style={{ ...heading, fontSize: 30, fontWeight: 700, textAlign: "center", marginBottom: 24 }}>{data.title}</h2> : null}
          <div style={{ display: "grid", gap: 16 }}>
            {(data.items ?? []).map((it: FaqItem, i: number) => (
              <div key={i}>
                <p style={{ fontWeight: 700 }}>{it.question}</p>
                <p style={{ color: "var(--site-muted)", marginTop: 4 }}>{it.answer}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "FORM_EMBED":
      return (
        <section style={{ ...section, textAlign: "center" }}>
          {data.title ? <h2 style={{ ...heading, fontSize: 26, fontWeight: 700, marginBottom: 12 }}>{data.title}</h2> : null}
          {data.formSlug ? (
            <p style={{ color: "var(--site-muted)" }}>
              Embedded form: <code>{data.formSlug}</code>
            </p>
          ) : (
            <p style={{ color: "var(--site-muted)" }}>No form configured.</p>
          )}
        </section>
      );
    case "HTML":
      return (
        <section style={section}>
          <div dangerouslySetInnerHTML={{ __html: data.html ?? "" }} />
        </section>
      );
    case "SPACER":
      return <div style={{ height: data.height ?? 48 }} />;
    case "GALLERY":
      return (
        <section style={section}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            {(data.images ?? []).map((img: GalleryImage, i: number) => (
              <img key={i} src={img.url} alt={img.alt ?? ""} style={{ width: "100%", borderRadius: "var(--site-radius)" }} />
            ))}
          </div>
        </section>
      );
    case "VIDEO":
      return (
        <section style={section}>
          {data.url ? (
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={data.url}
                title={data.caption ?? "Video"}
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", borderRadius: "var(--site-radius)" }}
              />
            </div>
          ) : null}
          {data.caption ? <p style={{ textAlign: "center", color: "var(--site-muted)", marginTop: 8 }}>{data.caption}</p> : null}
        </section>
      );
    default:
      return null;
  }
}
