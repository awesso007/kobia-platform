/*
 * Web forms settings (Sprint 5). Lists the tenant's web-to-lead forms and hosts
 * the create/edit builder + embed snippet generator (FormsClient).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { appOrigin } from "@/lib/billing/stripe";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { FormsClient, type WebFormRow } from "./FormsClient";

export const dynamic = "force-dynamic";

export default async function FormsSettingsPage() {
  try {
    const { db } = getTenantDb();
    const tenantSlug = headers().get("x-tenant-id") ?? "";
    const forms = await db.webForm.findMany({ orderBy: { createdAt: "desc" } });

    const rows: WebFormRow[] = forms.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      fields: (f.fieldsConfig as WebFormRow["fields"] | null) ?? [],
      thankYouUrl: f.thankYouUrl,
      redirectUrl: f.redirectUrl,
    }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <FormsClient rows={rows} tenantSlug={tenantSlug} origin={appOrigin()} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
