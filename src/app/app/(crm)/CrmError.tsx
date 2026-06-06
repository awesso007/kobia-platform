/*
 * Shown when a CRM page cannot resolve an active tenant (getTenantDb threw
 * NoTenantError). In the v0.1 alpha the active tenant comes from the kb-tenant
 * cookie (default "acme"); this surfaces a clear message instead of a 500.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export function CrmError() {
  return (
    <div
      className="grid place-items-center p-16 text-center"
      style={{
        backgroundColor: "var(--kb-surface)",
        border: "1px dashed var(--kb-border)",
        borderRadius: "var(--kb-radius)",
      }}
    >
      <p style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>No active tenant</p>
      <p className="mt-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        Could not resolve a tenant for this session. Append ?tenant=acme to the URL or set the
        kb-tenant cookie, then reload.
      </p>
    </div>
  );
}
