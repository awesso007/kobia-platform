"use client";

/*
 * SmsTab - the RecordPane "SMS" tab (Sprint 7). Lists SmsThread rows linked to
 * the record. Clicking a thread expands it inline and loads its messages
 * (marking it read). A composer at the bottom sends a new outbound text on the
 * open thread, or starts one to the record's phone when none exists yet.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Paperclip, X } from "lucide-react";
import type { RecordType } from "@/lib/crm/record";
import {
  listThreadsForRecord,
  openThread,
  sendSms,
  listOurNumbers,
  type SmsThreadRow,
  type SmsMessageRow,
  type OurNumberOption,
} from "@/app/app/(crm)/sms-actions";
import { uploadFile } from "@/lib/files/upload-client";

type Media = { fileId: string; name: string };

function MediaAttach({ media, setMedia }: { media: Media[]; setMedia: (m: Media[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function pick(files: FileList) {
    setUploading(true);
    const next = [...media];
    for (const file of Array.from(files)) {
      const res = await uploadFile(file);
      if (res.ok && res.fileId) next.push({ fileId: res.fileId, name: file.name });
    }
    setMedia(next);
    setUploading(false);
  }
  return (
    <div className="mt-1">
      <button type="button" onClick={() => ref.current?.click()} className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-primary)" }}>
        <Paperclip size={12} /> {uploading ? "Uploading..." : "Attach media"}
      </button>
      <input ref={ref} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) pick(e.target.files); e.target.value = ""; }} />
      {media.length ? (
        <ul className="mt-1 space-y-1">
          {media.map((m) => (
            <li key={m.fileId} className="flex items-center justify-between rounded px-2 py-0.5 text-[11px]" style={{ backgroundColor: "var(--kb-surface-grey)", borderRadius: "var(--kb-radius-sm)" }}>
              <span className="truncate">{m.name}</span>
              <button type="button" onClick={() => setMedia(media.filter((x) => x.fileId !== m.fileId))} aria-label="Remove"><X size={11} /></button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SmsTab({
  type,
  id,
  recordPhone,
}: {
  type: RecordType;
  id: string;
  recordPhone?: string | null;
}) {
  const [threads, setThreads] = useState<SmsThreadRow[]>([]);
  const [numbers, setNumbers] = useState<OurNumberOption[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    listThreadsForRecord(type, id).then((t) => {
      setThreads(t);
      setLoading(false);
    });
  }
  useEffect(() => {
    reload();
    listOurNumbers().then(setNumbers);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [type, id]);

  const onlyForContactOrLead = type === "contact" || type === "lead";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--kb-border)" }}>
        <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          {threads.length} conversation{threads.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex-1 overflow-auto px-3 py-3">
        {!onlyForContactOrLead ? (
          <p className="px-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>SMS is available on contacts and leads.</p>
        ) : loading ? (
          <p className="px-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading...</p>
        ) : threads.length === 0 ? (
          <p className="px-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>No conversations yet.</p>
        ) : (
          <ul className="space-y-2">
            {threads.map((t) => (
              <ThreadItem key={t.id} thread={t} contactId={type === "contact" ? id : null} leadId={type === "lead" ? id : null} onSent={reload} />
            ))}
          </ul>
        )}
      </div>
      {onlyForContactOrLead && threads.length === 0 && recordPhone && numbers.length > 0 ? (
        <NewConversation
          fromOptions={numbers}
          toE164={recordPhone}
          contactId={type === "contact" ? id : null}
          leadId={type === "lead" ? id : null}
          onSent={reload}
        />
      ) : null}
    </div>
  );
}

function ThreadItem({
  thread,
  contactId,
  leadId,
  onSent,
}: {
  thread: SmsThreadRow;
  contactId: string | null;
  leadId: string | null;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SmsMessageRow[] | null>(null);
  const [draft, setDraft] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [pending, startTransition] = useTransition();
  const [, loadTransition] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && messages === null) {
      loadTransition(async () => setMessages(await openThread(thread.id)));
    }
  }

  function send() {
    const body = draft.trim();
    if (!body && media.length === 0) return;
    startTransition(async () => {
      const res = await sendSms({
        fromE164: thread.ourNumberE164,
        toE164: thread.peerE164,
        body,
        contactId,
        leadId,
        mediaFileIds: media.map((m) => m.fileId),
      });
      if (res.ok) {
        setDraft("");
        setMedia([]);
        setMessages(await openThread(thread.id));
        onSent();
      }
    });
  }

  return (
    <li className="rounded" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="flex-1 truncate text-sm" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>
          {thread.peerName || thread.peerE164}
        </span>
        {thread.unreadCount > 0 ? (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: "var(--kb-primary)" }}>
            {thread.unreadCount}
          </span>
        ) : null}
        <span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{thread.messageCount}</span>
      </button>
      {open ? (
        <div className="px-3 pb-3">
          {messages === null ? (
            <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Loading messages...</p>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => <Bubble key={m.id} message={m} />)}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Type a message"
              className="flex-1 rounded px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
            />
            <button
              type="button"
              onClick={send}
              disabled={pending || (!draft.trim() && media.length === 0)}
              className="rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              {pending ? "..." : "Send"}
            </button>
          </div>
          <MediaAttach media={media} setMedia={setMedia} />
        </div>
      ) : null}
    </li>
  );
}

function Bubble({ message }: { message: SmsMessageRow }) {
  const outbound = message.direction === "OUTBOUND";
  return (
    <li className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[80%] rounded px-3 py-2 text-sm"
        style={{
          backgroundColor: outbound ? "var(--kb-primary)" : "var(--kb-surface-grey)",
          color: outbound ? "#fff" : "var(--kb-text-primary)",
          borderRadius: "var(--kb-radius-sm)",
        }}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        <div className="mt-1 text-[10px]" style={{ opacity: 0.7 }}>
          {message.sentAt ? new Date(message.sentAt).toLocaleString() : new Date(message.createdAt).toLocaleString()}
          {message.status === "FAILED" ? " (failed)" : ""}
        </div>
      </div>
    </li>
  );
}

function NewConversation({
  fromOptions,
  toE164,
  contactId,
  leadId,
  onSent,
}: {
  fromOptions: OurNumberOption[];
  toE164: string;
  contactId: string | null;
  leadId: string | null;
  onSent: () => void;
}) {
  const [from, setFrom] = useState(fromOptions[0]?.e164 ?? "");
  const [draft, setDraft] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    const body = draft.trim();
    if ((!body && media.length === 0) || !from) return;
    startTransition(async () => {
      const res = await sendSms({ fromE164: from, toE164, body, contactId, leadId, mediaFileIds: media.map((m) => m.fileId) });
      if (res.ok) {
        setDraft("");
        setMedia([]);
        setError(null);
        onSent();
      } else {
        setError(res.error ?? "Failed to send.");
      }
    });
  }

  return (
    <div className="px-5 py-4" style={{ borderTop: "1px solid var(--kb-border)" }}>
      <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        <span>From</span>
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded px-2 py-1 text-xs outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
        >
          {fromOptions.map((o) => (
            <option key={o.id} value={o.e164}>{o.friendlyName || o.e164}</option>
          ))}
        </select>
        <span>to {toE164}</span>
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Start a conversation"
          className="flex-1 rounded px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || (!draft.trim() && media.length === 0)}
          className="rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          {pending ? "..." : "Send"}
        </button>
      </div>
      <MediaAttach media={media} setMedia={setMedia} />
      {error ? <p className="mt-1 text-xs" style={{ color: "var(--kb-danger, #dc2626)" }}>{error}</p> : null}
    </div>
  );
}
