"use client";

/*
 * EmailComposer - slide-in panel for composing/replying to email (Sprint 6).
 * Opened from the RecordPane "Compose Email" button, the global "+ Email" in
 * the top bar, and the Email tab reply/forward actions.
 *
 * To/Cc/Bcc support a contact typeahead (Contacts with an email) plus free
 * text. Body is a textarea with a template picker and signature dropdown;
 * template variables are resolved client-side from the optional record context
 * ({{contact.firstName}}, {{deal.name}}, {{company.name}}, {{owner.firstName}}).
 * Send is disabled when no email account is connected.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { RecordType } from "@/lib/crm/record";
import {
  getComposerData,
  searchContacts,
  sendComposed,
  type ComposerData,
  type ContactSuggestion,
} from "@/app/app/(crm)/email-actions";

export type ComposerContext = {
  recordType?: RecordType;
  recordId?: string;
  /** Flat values for client-side template variable resolution. */
  vars?: Record<string, string>;
  replyToThreadId?: string;
  prefill?: { to?: string[]; cc?: string[]; subject?: string; html?: string };
};

const inputStyle: React.CSSProperties = { border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" };

/** Resolve {{contact.firstName}} etc against a flat vars map (dot keys). */
function resolveVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key) => vars[key] ?? "");
}

export function EmailComposer({ context, onClose, onSent }: { context: ComposerContext; onClose: () => void; onSent?: (threadId?: string) => void }) {
  const [data, setData] = useState<ComposerData | null>(null);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState((context.prefill?.to ?? []).join(", "));
  const [cc, setCc] = useState((context.prefill?.cc ?? []).join(", "));
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(Boolean(context.prefill?.cc?.length));
  const [subject, setSubject] = useState(context.prefill?.subject ?? "");
  const [body, setBody] = useState(context.prefill?.html ?? "");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getComposerData().then((d) => {
      setData(d);
      if (d.accounts[0]) setAccountId(d.accounts[0].id);
      const def = d.signatures.find((s) => s.isDefault);
      if (def && !context.prefill?.html) setBody((b) => (b ? b : `<br/><br/>${def.html}`));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(id: string) {
    const tpl = data?.templates.find((t) => t.id === id);
    if (!tpl) return;
    const vars = context.vars ?? {};
    setSubject(resolveVars(tpl.subject, vars));
    setBody(resolveVars(tpl.bodyHtml, vars));
  }
  function applySignature(id: string) {
    const sig = data?.signatures.find((s) => s.id === id);
    if (!sig) return;
    setBody((b) => `${b}<br/><br/>${sig.html}`);
  }

  function onToChange(v: string) {
    setTo(v);
    const last = v.split(",").pop()?.trim() ?? "";
    if (last.length >= 2) searchContacts(last).then(setSuggestions);
    else setSuggestions([]);
  }
  function pickSuggestion(s: ContactSuggestion) {
    const parts = to.split(",").map((p) => p.trim()).filter(Boolean);
    parts[parts.length > 0 ? parts.length - 1 : 0] = s.email;
    setTo(parts.join(", ") + ", ");
    setSuggestions([]);
  }

  function parseList(v: string): string[] {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }

  function send() {
    setError(null);
    const recipients = parseList(to);
    if (!accountId) { setError("Connect an email account first."); return; }
    if (recipients.length === 0) { setError("At least one recipient is required."); return; }
    startTransition(async () => {
      const r = await sendComposed({
        accountId,
        to: recipients,
        cc: parseList(cc),
        bcc: parseList(bcc),
        subject,
        html: body,
        replyToThreadId: context.replyToThreadId,
        recordType: context.recordType,
        recordId: context.recordId,
      });
      if (!r.ok) setError(r.error ?? "Could not send.");
      else { onSent?.(r.threadId); onClose(); }
    });
  }

  const noAccounts = data !== null && data.accounts.length === 0;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: "rgba(0,0,0,0.25)" }} onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 z-50 flex h-full flex-col" style={{ width: "520px", maxWidth: "100vw", backgroundColor: "var(--kb-surface)", boxShadow: "var(--kb-shadow-modal)" }} role="dialog" aria-label="Compose email">
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--kb-border)" }}>
          <h2 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{context.replyToThreadId ? "Reply" : "Compose email"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: "var(--kb-text-secondary)" }}><X size={18} /></button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-2">
          {error ? <div className="text-xs" style={{ color: "var(--kb-error)" }}>{error}</div> : null}
          {noAccounts ? <div className="rounded px-3 py-2 text-xs" style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>No email account connected. Add one under Settings / Email.</div> : null}

          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>From</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle}>
              {(data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.displayName ? `${a.displayName} <${a.address}>` : a.address}</option>)}
            </select>
          </label>

          <label className="block relative">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>To</span>
            <input value={to} onChange={(e) => onToChange(e.target.value)} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} />
            {!showCc ? <button type="button" onClick={() => setShowCc(true)} className="absolute right-0 top-0 text-xs underline" style={{ color: "var(--kb-primary)" }}>Cc/Bcc</button> : null}
            {suggestions.length > 0 ? (
              <ul className="absolute z-10 mt-1 w-full rounded" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", boxShadow: "var(--kb-shadow-card)" }}>
                {suggestions.map((s) => (
                  <li key={s.id}><button type="button" onClick={() => pickSuggestion(s)} className="block w-full px-3 py-1.5 text-left text-sm" style={{ color: "var(--kb-text-primary)" }}>{s.name} <span style={{ color: "var(--kb-text-secondary)" }}>{s.email}</span></button></li>
                ))}
              </ul>
            ) : null}
          </label>

          {showCc ? (
            <>
              <label className="block"><span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Cc</span><input value={cc} onChange={(e) => setCc(e.target.value)} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></label>
              <label className="block"><span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Bcc</span><input value={bcc} onChange={(e) => setBcc(e.target.value)} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></label>
            </>
          ) : null}

          <label className="block"><span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded px-2 py-1 text-sm outline-none" style={inputStyle} /></label>

          <div className="flex gap-2">
            <select defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.target.value = ""; }} className="rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
              <option value="">Insert template...</option>
              {(data?.templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select defaultValue="" onChange={(e) => { applySignature(e.target.value); e.target.value = ""; }} className="rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
              <option value="">Append signature...</option>
              {(data?.signatures ?? []).map((s) => <option key={s.id} value={s.id}>{s.isDefault ? "Default signature" : `Signature ${s.id.slice(0, 6)}`}</option>)}
            </select>
          </div>

          <label className="block"><span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Body (HTML)</span><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="w-full rounded px-2 py-1 text-sm outline-none font-mono" style={inputStyle} /></label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--kb-border)" }}>
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={send} disabled={pending || noAccounts}>{pending ? "Sending..." : "Send"}</KbButton>
        </div>
      </aside>
    </>
  );
}
