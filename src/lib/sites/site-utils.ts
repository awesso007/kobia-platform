/*
 * Pure site helpers (Sprint 17): slug derivation, theme token typing, theme ->
 * CSS variable mapping, and small formatters. No "use client" and no server
 * import, so both the editor client components and the public server renderer
 * can import it.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type ThemeTokens = {
  colors: {
    primary: string;
    background: string;
    foreground: string;
    muted: string;
    accent: string;
  };
  fonts: {
    body: string;
    heading: string;
  };
  radii: {
    base: string;
  };
  spacing: {
    section: string;
  };
};

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  colors: {
    primary: "#4f46e5",
    background: "#ffffff",
    foreground: "#0f172a",
    muted: "#64748b",
    accent: "#6366f1",
  },
  fonts: {
    body: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    heading: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  radii: { base: "8px" },
  spacing: { section: "64px" },
};

/** Merge stored (possibly partial) tokens onto the defaults. Never throws. */
export function resolveThemeTokens(raw: unknown): ThemeTokens {
  const t = (raw ?? {}) as Partial<ThemeTokens>;
  return {
    colors: { ...DEFAULT_THEME_TOKENS.colors, ...(t.colors ?? {}) },
    fonts: { ...DEFAULT_THEME_TOKENS.fonts, ...(t.fonts ?? {}) },
    radii: { ...DEFAULT_THEME_TOKENS.radii, ...(t.radii ?? {}) },
    spacing: { ...DEFAULT_THEME_TOKENS.spacing, ...(t.spacing ?? {}) },
  };
}

/** Build the CSS custom-property map applied to the public site root element. */
export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
  return {
    "--site-primary": tokens.colors.primary,
    "--site-bg": tokens.colors.background,
    "--site-fg": tokens.colors.foreground,
    "--site-muted": tokens.colors.muted,
    "--site-accent": tokens.colors.accent,
    "--site-font-body": tokens.fonts.body,
    "--site-font-heading": tokens.fonts.heading,
    "--site-radius": tokens.radii.base,
    "--site-section": tokens.spacing.section,
  };
}

/** Derive a URL-safe slug from arbitrary text (lowercase, hyphenated). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Basic hostname/domain validation for custom domains. */
export function isValidDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (d.length === 0 || d.length > 253) return false;
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtNumber(n: number): string {
  return n.toLocaleString();
}

/** A short label for the published/draft state of a site or page. */
export function statusLabel(published: boolean): string {
  return published ? "Published" : "Draft";
}
