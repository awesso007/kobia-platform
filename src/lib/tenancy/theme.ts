/*
 * theme.ts (Sprint 5). Per-tenant theme shape + defaults + CSS-var resolution.
 * The tenant_registry.theme JSON stores brand colors; the CRM shell injects
 * them as CSS variables so design tokens (--kb-primary / --kb-accent-purple)
 * pick up the tenant brand.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export type TenantTheme = {
  primary: string;
  accent: string;
};

export const DEFAULT_THEME: TenantTheme = {
  primary: "#1d77bd",
  accent: "#7d4aea",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Coerce arbitrary JSON into a safe TenantTheme, falling back to defaults. */
export function resolveTheme(raw: unknown): TenantTheme {
  const t = (raw ?? {}) as Partial<TenantTheme>;
  return {
    primary: typeof t.primary === "string" && HEX.test(t.primary) ? t.primary : DEFAULT_THEME.primary,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent : DEFAULT_THEME.accent,
  };
}

/** Build the inline CSS-var overrides for a theme, scoped to .kobia-crm. */
export function themeCssVars(theme: TenantTheme): string {
  return `:root, .kobia-crm { --kb-primary: ${theme.primary}; --kb-accent-purple: ${theme.accent}; }`;
}
