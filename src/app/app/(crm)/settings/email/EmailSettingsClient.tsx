"use client";

/*
 * Email settings UI (Sprint 6). Four tabs:
 *   1. Accounts  - list + connect SMTP/IMAP modal + test connection + OAuth stub
 *   2. Templates - CRUD with a textarea HTML editor (bold/italic helpers)
 *   3. Signatures - CRUD, set default per user
 *   4. Routing   - explains the inbound address pattern for this tenant
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import {
  saveAccount,
  deleteAccount,
  testConnection,
  saveTemplate,
  deleteTemplate,
  saveSignature,
  deleteSignature,
  type AccountInput,
} from "./actions";

export type AccountRow = {
  id: string;
  address: string;
  provider: "SMTP_IMAP" | "GMAIL_OAUTH" | "OUTLOOK_OAUTH";
  displayName: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  status: "ACTIVE" | "PAUSED" | "ERROR";
  hasSmtpPass: boolean;
  hasImapPass: boolean;
};
export type TemplateRow = { id: string; name: string; subject: string; bodyHtml: string; scope: "PERSONAL" | "TENANT" };
export type SignatureRow = { id: string; html: string; isDefault: boolean };

const inputStyle: React.CSSProperties = { border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" };
const TABS = ["Accounts", "Templates", "Signatures", "Routing"] as const;
type Tab = (typeof TABS)[number];

export function EmailSettingsClient({
  accounts,
  templates,
  signatures,
  encryptionConfigured,
  tenantSlug,
}: {
  accounts: AccountRow[];
  templates: TemplateRow[];
  signatures: SignatureRow[];
  encryptionConfigured: boolean;
  tenantSlug: string;
}) {
  const [tab, setTab] = useState<Tab>("Accounts");

  return (
    <div>
      {!encryptionConfigured ? (
        <div
          className="mb-4 rounded px-3 py-2 text-sm"
          style={{ backgroundColor: "#fbeaea", border: "1px solid var(--kb-error)", color: "var(--kb-error)" }}
        >
          Encryption key not set - passwords will be stored in plain text. Set SECRETS_ENCRYPTION_KEY before connecting accounts.
        </div>
      ) : null}

      <div className="mb-4 flex gap-1" style={{ borderBottom: "1px solid var(--kb-border)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-3 py-2 text-sm"
            style={{
              color: tab === t ? "var(--kb-primary)" : "var(--kb-text-secondary)",
              fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? "2px solid var(--kb-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Accounts" ? <AccountsTab accounts={accounts} /> : null}
      {tab === "Templates" ? <TemplatesTab templates={templates} /> : null}
      {tab === "Signatures" ? <SignaturesTab signatures={signatures} /> : null}
      {tab === "Routing" ? <RoutingTab tenantSlug={tenantSlug} /> : null}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
      {children}
    </div>
  );
}

/* ---------------------------------- Accounts ---------------------------------- */

function AccountsTab({ accounts }: { accounts: AccountRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AccountRow | "new" | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onTest(id: string) {
    startTransition(async () => {
      const r = await testConnection(id);
      setTestResult((s) => ({ ...s, [id]: r.ok ? `SMTP ${r.smtp} / IMAP ${r.imap}` : r.error ?? "failed" }));
    });
  }
  function onDelete(a: AccountRow) {
    if (!confirm(`Remove ${a.address}? Its threads and messages will be deleted.`)) return;
    startTransition(async () => {
      await deleteAccount(a.id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex justify-end gap-2">
        <KbButton variant="outline" onClick={() => alert("OAuth sign-in for Gmail is not configured yet.")}>Connect Gmail</KbButton>
        <KbButton variant="outline" onClick={() => alert("OAuth sign-in for Outlook is not configured yet.")}>Connect Outlook</KbButton>
        <KbButton onClick={() => setEditing("new")}><Plus size={16} /> Connect SMTP/IMAP</KbButton>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <th className="px-3 py-2 text-left font-medium">Address</th>
              <th className="px-3 py-2 text-left font-medium">Provider</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Test</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No email accounts connected.</td></tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--kb-border)" }}>
                  <td className="px-3 py-2" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>
                    {a.address}
                    {a.displayName ? <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{a.displayName}</div> : null}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{a.provider}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{a.status}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>
                    <button type="button" disabled={pending} onClick={() => onTest(a.id)} className="text-xs underline" style={{ color: "var(--kb-primary)" }}>Test connection</button>
                    {testResult[a.id] ? <div className="text-xs">{testResult[a.id]}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button type="button" onClick={() => setEditing(a)} aria-label="Edit" style={{ color: "var(--kb-text-secondary)" }}><Pencil size={16} /></button>
                      <button type="button" onClick={() => onDelete(a)} aria-label="Delete" style={{ color: "var(--kb-error)" }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      {editing ? <AccountModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} /> : null}
    </div>
  );
}

function AccountModal({ initial, onClose, onSaved }: { initial: AccountRow | null; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AccountInput>({
    id: initial?.id,
    address: initial?.address ?? "",
    provider: "SMTP_IMAP",
    displayName: initial?.displayName ?? "",
    smtpHost: initial?.smtpHost ?? "",
    smtpPort: initial?.smtpPort ?? 587,
    smtpUser: initial?.smtpUser ?? "",
    smtpPass: "",
    imapHost: initial?.imapHost ?? "",
    imapPort: initial?.imapPort ?? 993,
    imapUser: initial?.imapUser ?? "",
    imapPass: "",
    status: initial?.status ?? "ACTIVE",
  });
  const set = (patch: Partial<AccountInput>) => setForm((f) => ({ ...f, ...patch }));

  function save() {
    startTransition(async () => {
      const r = await saveAccount(form);
      if (!r.ok) setError(r.error ?? "Could not save.");
      else onSaved();
    });
  }

  return (
    <Overlay onClose={onClose} title={initial ? "Edit account" : "Connect SMTP/IMAP account"}>
      <div className="space-y-2">
        {error ? <div className="text-xs" style={{ color: "var(--kb-error)" }}>{error}</div> : null}
        <Field label="Email address"><input value={form.address} onChange={(e) => set({ address: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
        <Field label="Display name"><input value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="SMTP host"><input value={form.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
          <Field label="SMTP port"><input type="number" value={form.smtpPort} onChange={(e) => set({ smtpPort: Number(e.target.value) })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
          <Field label="SMTP user"><input value={form.smtpUser} onChange={(e) => set({ smtpUser: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
          <Field label={initial?.hasSmtpPass ? "SMTP password (set; leave blank to keep)" : "SMTP password"}><input type="password" value={form.smtpPass} onChange={(e) => set({ smtpPass: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
          <Field label="IMAP host"><input value={form.imapHost} onChange={(e) => set({ imapHost: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
          <Field label="IMAP port"><input type="number" value={form.imapPort} onChange={(e) => set({ imapPort: Number(e.target.value) })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
          <Field label="IMAP user"><input value={form.imapUser} onChange={(e) => set({ imapUser: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
          <Field label={initial?.hasImapPass ? "IMAP password (set; leave blank to keep)" : "IMAP password"}><input type="password" value={form.imapPass} onChange={(e) => set({ imapPass: e.target.value })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
        </div>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set({ status: e.target.value as AccountInput["status"] })} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle}>
            {["ACTIVE", "PAUSED", "ERROR"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={save} disabled={pending || !form.address.trim()}>{pending ? "Saving..." : "Save account"}</KbButton>
        </div>
      </div>
    </Overlay>
  );
}

/* ---------------------------------- Templates ---------------------------------- */

function TemplatesTab({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);
  const [, startTransition] = useTransition();

  function onDelete(t: TemplateRow) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    startTransition(async () => { await deleteTemplate(t.id); router.refresh(); });
  }
  return (
    <div>
      <div className="mb-3 flex justify-end"><KbButton onClick={() => setEditing("new")}><Plus size={16} /> New template</KbButton></div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Subject</th>
              <th className="px-3 py-2 text-left font-medium">Scope</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No templates yet.</td></tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid var(--kb-border)" }}>
                  <td className="px-3 py-2" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>{t.name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{t.subject}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{t.scope}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button type="button" onClick={() => setEditing(t)} aria-label="Edit" style={{ color: "var(--kb-text-secondary)" }}><Pencil size={16} /></button>
                      <button type="button" onClick={() => onDelete(t)} aria-label="Delete" style={{ color: "var(--kb-error)" }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      {editing ? <TemplateModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} /> : null}
    </div>
  );
}

function TemplateModal({ initial, onClose, onSaved }: { initial: TemplateRow | null; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(initial?.bodyHtml ?? "");
  const [scope, setScope] = useState<"PERSONAL" | "TENANT">(initial?.scope ?? "PERSONAL");

  function wrap(tag: "b" | "i") {
    setBodyHtml((h) => `${h}<${tag}></${tag}>`);
  }
  function save() {
    startTransition(async () => { await saveTemplate({ id: initial?.id, name, subject, bodyHtml, scope }); onSaved(); });
  }
  return (
    <Overlay onClose={onClose} title={initial ? "Edit template" : "New template"}>
      <div className="space-y-2">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
        <Field label="Subject (supports {{record.field}})"><input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></Field>
        <Field label="Body HTML">
          <div className="mb-1 flex gap-1">
            <button type="button" onClick={() => wrap("b")} className="rounded px-2 py-0.5 text-xs font-bold" style={inputStyle}>B</button>
            <button type="button" onClick={() => wrap("i")} className="rounded px-2 py-0.5 text-xs italic" style={inputStyle}>I</button>
          </div>
          <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={8} className="w-full rounded px-2 py-1 text-sm outline-none font-mono" style={inputStyle} />
        </Field>
        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value as "PERSONAL" | "TENANT")} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle}>
            <option value="PERSONAL">Personal</option>
            <option value="TENANT">Shared (tenant)</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={save} disabled={pending || !name.trim()}>{pending ? "Saving..." : "Save template"}</KbButton>
        </div>
      </div>
    </Overlay>
  );
}

/* ---------------------------------- Signatures ---------------------------------- */

function SignaturesTab({ signatures }: { signatures: SignatureRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SignatureRow | "new" | null>(null);
  const [, startTransition] = useTransition();
  function onDelete(s: SignatureRow) {
    if (!confirm("Delete this signature?")) return;
    startTransition(async () => { await deleteSignature(s.id); router.refresh(); });
  }
  return (
    <div>
      <div className="mb-3 flex justify-end"><KbButton onClick={() => setEditing("new")}><Plus size={16} /> New signature</KbButton></div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <th className="px-3 py-2 text-left font-medium">Preview</th>
              <th className="px-3 py-2 text-left font-medium">Default</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {signatures.length === 0 ? (
              <tr><td colSpan={3} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No signatures yet.</td></tr>
            ) : (
              signatures.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--kb-border)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}><div dangerouslySetInnerHTML={{ __html: s.html }} /></td>
                  <td className="px-3 py-2">{s.isDefault ? <Check size={16} style={{ color: "var(--kb-success)" }} /> : null}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button type="button" onClick={() => setEditing(s)} aria-label="Edit" style={{ color: "var(--kb-text-secondary)" }}><Pencil size={16} /></button>
                      <button type="button" onClick={() => onDelete(s)} aria-label="Delete" style={{ color: "var(--kb-error)" }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      {editing ? <SignatureModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} /> : null}
    </div>
  );
}

function SignatureModal({ initial, onClose, onSaved }: { initial: SignatureRow | null; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [html, setHtml] = useState(initial?.html ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  function save() {
    startTransition(async () => { await saveSignature({ id: initial?.id, html, isDefault }); onSaved(); });
  }
  return (
    <Overlay onClose={onClose} title={initial ? "Edit signature" : "New signature"}>
      <div className="space-y-2">
        <Field label="Signature HTML"><textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={6} className="w-full rounded px-2 py-1 text-sm outline-none font-mono" style={inputStyle} /></Field>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Set as my default
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={save} disabled={pending}>{pending ? "Saving..." : "Save signature"}</KbButton>
        </div>
      </div>
    </Overlay>
  );
}

/* ---------------------------------- Routing ---------------------------------- */

function RoutingTab({ tenantSlug }: { tenantSlug: string }) {
  const address = `kobia+${tenantSlug || "acme"}@inbound.kobia.ai`;
  return (
    <Card>
      <div className="space-y-3 p-4 text-sm" style={{ color: "var(--kb-text-primary)" }}>
        <p style={{ color: "var(--kb-text-secondary)" }}>
          Inbound email is routed to a tenant by the recipient address. Forward or alias mail to the address below and replies will be threaded onto the matching CRM records automatically.
        </p>
        <div className="rounded px-3 py-2 font-mono text-sm" style={{ backgroundColor: "var(--kb-surface-grey)", border: "1px solid var(--kb-border)" }}>
          {address}
        </div>
        <p style={{ color: "var(--kb-text-secondary)" }}>
          Pattern: <code>kobia+&lt;slug&gt;@inbound.kobia.ai</code>. Messages that do not match a slug fall back to the default tenant. The inbound endpoint requires the EMAIL_INBOUND_SECRET header; until that env var is set, inbound mail is rejected.
        </p>
      </div>
    </Card>
  );
}

/* ---------------------------------- Shared ---------------------------------- */

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded p-4" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: "var(--kb-text-secondary)" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}
