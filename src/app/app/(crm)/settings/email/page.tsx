/*
 * Email settings (Sprint 6). Four tabs: Connected accounts, Templates,
 * Signatures, and Routing. Surfaces a banner when SECRETS_ENCRYPTION_KEY is not
 * configured (passwords would be stored in plain text).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { isEncryptionConfigured } from "@/lib/crypto/secrets";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { EmailSettingsClient, type AccountRow, type TemplateRow, type SignatureRow } from "./EmailSettingsClient";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  try {
    const { db } = getTenantDb();
    const tenantSlug = headers().get("x-tenant-id") ?? "acme";
    const [accounts, templates, signatures] = await Promise.all([
      db.emailAccount.findMany({ orderBy: { createdAt: "asc" } }),
      db.emailTemplate.findMany({ orderBy: { name: "asc" } }),
      db.emailSignature.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

    const accountRows: AccountRow[] = accounts.map((a) => ({
      id: a.id,
      address: a.address,
      provider: a.provider as AccountRow["provider"],
      displayName: a.displayName,
      smtpHost: a.smtpHost,
      smtpPort: a.smtpPort,
      smtpUser: a.smtpUser,
      imapHost: a.imapHost,
      imapPort: a.imapPort,
      imapUser: a.imapUser,
      status: a.status as AccountRow["status"],
      hasSmtpPass: Boolean(a.smtpPassEncrypted),
      hasImapPass: Boolean(a.imapPassEncrypted),
    }));
    const templateRows: TemplateRow[] = templates.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      scope: t.scope as TemplateRow["scope"],
    }));
    const signatureRows: SignatureRow[] = signatures.map((s) => ({ id: s.id, html: s.html, isDefault: s.isDefault }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <EmailSettingsClient
          accounts={accountRows}
          templates={templateRows}
          signatures={signatureRows}
          encryptionConfigured={isEncryptionConfigured()}
          tenantSlug={tenantSlug}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
