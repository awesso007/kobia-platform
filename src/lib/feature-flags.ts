/*
 * Feature flags. Sprint 1: gate the legacy accounting surface so it is hidden
 * by default while the CRM shell is built. Set ENABLE_ACCOUNTING=true to expose
 * the legacy accounting routes and navigation.
 */

function flag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

export const featureFlags = {
  // Default off: accounting is hidden in v0.1 (CRM alpha).
  enableAccounting: flag("ENABLE_ACCOUNTING", false),
};

export function accountingEnabled(): boolean {
  return featureFlags.enableAccounting;
}
