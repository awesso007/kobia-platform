"use client";

/*
 * EmailTab - the RecordPane "Email" tab (Sprint 6). Lists EmailThread rows
 * linked to the record (latest first). Clicking a thread expands it inline and
 * loads its messages in order (marking the thread read). Reply / Reply-all /
 * Forward open the composer pre-filled. A "Compose Email" button starts a fresh
 * message linked to this record.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { RecordType } from "@/lib/crm/record";
import {
  listThreadsForRecord,
  openThread,
  type EmailThreadRow,
  type EmailMessageRow,
} from "@/app/app/(crm)/email-actions";
import { EmailComposer, type ComposerContext } from "./EmailComposer";

export function EmailTab({ type, id, vars }: { type: RecordType; id: string; vars?: Record<string, string> }) {
  const [threads, setThreads] = useState<EmailThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState<ComposerContext | null>(null);

  function reload() {
    setLoading(true);
    listThreadsForRecord(type, id).then((t) => { setThreads(t); setLoading(false); });
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [type, id]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--kb-border)" }}>
        <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{threads.length} thread{threads.length === 1 ? "" : "s"}</span>
        <KbButton onClick={() => setComposer({ recordType: type, recordId: id, vars })}><Mail size={14} /> Compose Email</KbButton>
      </div>
      <div className="flex-1 overflow-auto px-3 py-3">
        {loading ? (
          <p className="px-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading...</p>
        ) : threads.length === 0 ? (
          <p className="px-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>No email threads yet.</p>
        ) : (
          <ul className="space-y-2">
            {threads.map((t) => (
              <ThreadItem key={t.id} thread={t} onReply={(ctx) => setComposer({ ...ctx, recordType: type, recordId: id, vars })} />
            ))}
          </ul>
        )}
      </div>
      {composer ? <EmailComposer context={composer} onClose={() => setComposer(null)} onSent={() => { setComposer(null); reload(); }} /> : null}
    </div>
  );
}

function ThreadItem({ thread, onReply }: { thread: EmailThreadRow; onReply: (ctx: ComposerContext) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<EmailMessageRow[] | null>(null);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && messages === null) {
      startTransition(async () => setMessages(await openThread(thread.id)));
    }
  }

  return (
    <li className="rounded" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="flex-1 truncate text-sm" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>{thread.subject || "(no subject)"}</span>
        {thread.unreadCount > 0 ? <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: "var(--kb-primary)" }}>{thread.unreadCount}</span> : null}
        <span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{thread.messageCount}</span>
      </button>
      {open ? (
        <div className="px-3 pb-3">
          {messages === null ? (
            <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Loading messages...</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => <MessageItem key={m.id} message={m} thread={thread} onReply={onReply} />)}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function MessageItem({ message, thread, onReply }: { message: EmailMessageRow; thread: EmailThreadRow; onReply: (ctx: ComposerContext) => void }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const stamp = message.sentAt ?? message.receivedAt;
  const html = message.bodyHtml ?? "";
  // Collapse quoted reply chains (lines after a blockquote or a "On ... wrote:").
  const splitIdx = html.search(/<blockquote|On .*wrote:/i);
  const visible = splitIdx > 0 ? html.slice(0, splitIdx) : html;
  const quoted = splitIdx > 0 ? html.slice(splitIdx) : "";

  function buildReply(all: boolean): ComposerContext {
    const to = message.direction === "INBOUND" ? [message.fromAddress] : message.toAddresses;
    const cc = all ? message.toAddresses.filter((a) => a !== message.fromAddress) : [];
    return {
      replyToThreadId: thread.id,
      prefill: {
        to,
        cc,
        subject: thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject ?? ""}`,
        html: `<br/><br/><blockquote>${html}</blockquote>`,
      },
    };
  }
  function buildForward(): ComposerContext {
    return {
      prefill: {
        subject: thread.subject?.startsWith("Fwd:") ? thread.subject : `Fwd: ${thread.subject ?? ""}`,
        html: `<br/><br/>---------- Forwarded message ----------<br/>${html}`,
      },
    };
  }

  return (
    <li className="rounded p-2" style={{ backgroundColor: "var(--kb-surface-grey)", borderRadius: "var(--kb-radius-sm)" }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>
          {message.direction === "INBOUND" ? message.fromAddress : `To: ${message.toAddresses.join(", ")}`}
        </span>
        <span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{stamp ? new Date(stamp).toLocaleString() : ""}{message.status === "FAILED" ? " (failed)" : ""}</span>
      </div>
      <div className="text-sm" style={{ color: "var(--kb-text-primary)" }} dangerouslySetInnerHTML={{ __html: visible || message.snippet || message.bodyText || "" }} />
      {quoted ? (
        <>
          <button type="button" onClick={() => setShowQuoted((s) => !s)} className="mt-1 text-xs underline" style={{ color: "var(--kb-text-secondary)" }}>{showQuoted ? "Hide quoted" : "Show quoted text"}</button>
          {showQuoted ? <div className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }} dangerouslySetInnerHTML={{ __html: quoted }} /> : null}
        </>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onReply(buildReply(false))} className="text-xs underline" style={{ color: "var(--kb-primary)" }}>Reply</button>
        <button type="button" onClick={() => onReply(buildReply(true))} className="text-xs underline" style={{ color: "var(--kb-primary)" }}>Reply all</button>
        <button type="button" onClick={() => onReply(buildForward())} className="text-xs underline" style={{ color: "var(--kb-primary)" }}>Forward</button>
      </div>
    </li>
  );
}
