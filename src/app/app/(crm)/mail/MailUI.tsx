"use client";

/*
 * Webmail client components (Sprint 23). "use client" and exports ONLY React
 * components. All pure helpers live in src/lib/mail/mail-utils.ts (no
 * "use client") so server pages can import them without turning them into
 * client-reference proxies. Do not add non-component exports here.
 *
 * Every interaction POSTs/PATCHes to /api/mail/**; on success we refresh the
 * route so the server-rendered data remains the source of truth. Keyboard
 * shortcuts (j/k/e/#/r/c) drive the middle list like Gmail.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  Send,
  FileText,
  Archive,
  ShieldAlert,
  Trash2,
  Star,
  Tag,
  RefreshCw,
  Settings as SettingsIcon,
  PenSquare,
  Search as SearchIcon,
  Reply,
  Plus,
  X,
} from "lucide-react";
import { fmtRelativeTime, fmtDate, formatAddresses, displayNameOf, sanitizeEmailHtml } from "@/lib/mail/mail-utils";

/* ------------------------------------------------------------------ types */

export type MailLabel = { id: string; name: string; color: string };
type MsgLabel = { labelId: string; label: MailLabel };

export type MailMessage = {
  id: string;
  threadId: string;
  direction: string;
  fromAddress: string;
  toAddresses: unknown;
  ccAddresses?: unknown;
  subject: string | null;
  snippet: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  folder: string;
  isRead: boolean;
  isStarred: boolean;
  sentAt: string | Date | null;
  receivedAt: string | Date | null;
  createdAt: string | Date;
  labels: MsgLabel[];
};

export type ThreadMessage = MailMessage & {
  attachments?: { id: string; filename: string; mimeType: string; size: number }[];
};

export type MailAccount = {
  id: string;
  address: string;
  displayName: string | null;
  provider: string;
  status: string;
  lastSyncedAt: string | Date | null;
};

export type MailSignature = { id: string; name: string | null; html: string; isDefault: boolean };
export type MailFilter = {
  id: string;
  name: string;
  condition: unknown;
  action: unknown;
  enabled: boolean;
};
export type MailDraft = {
  id: string;
  threadId: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  body: string | null;
  inReplyTo: string | null;
  updatedAt: string | Date;
};

/* -------------------------------------------------------------- api helper */

async function api(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok || data.ok === false) {
    throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status}).`);
  }
  return data;
}

const FOLDER_META: { key: string; label: string; icon: typeof Inbox }[] = [
  { key: "INBOX", label: "Inbox", icon: Inbox },
  { key: "SENT", label: "Sent", icon: Send },
  { key: "DRAFTS", label: "Drafts", icon: FileText },
  { key: "ARCHIVE", label: "Archive", icon: Archive },
  { key: "SPAM", label: "Spam", icon: ShieldAlert },
  { key: "TRASH", label: "Trash", icon: Trash2 },
];

function firstAddress(from: string): { name: string; email: string } {
  const parsed = formatAddresses(from);
  return parsed[0] ?? { name: displayNameOf(from), email: from };
}

/* ------------------------------------------------------------- left rail */

function LeftRail({
  accounts,
  account,
  labels,
  counts,
  activeFolder,
  activeLabelId,
}: {
  accounts: MailAccount[];
  account: MailAccount;
  labels: MailLabel[];
  counts: Record<string, number>;
  activeFolder: string | null;
  activeLabelId: string | null;
}) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();

  function onSync() {
    startSync(async () => {
      try {
        await api(`/api/mail/${account.id}/sync`, { method: "POST" });
      } catch {
        /* surfaced via lastSyncedAt; ignore transient errors here */
      }
      router.refresh();
    });
  }

  function switchAccount(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/app/mail/${e.target.value}`);
  }

  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r"
      style={{ borderColor: "var(--kb-border)", background: "var(--kb-surface)" }}
    >
      <div className="p-3">
        <select
          value={account.id}
          onChange={switchAccount}
          className="mb-3 w-full rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)", color: "var(--kb-text-primary)" }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName ? `${a.displayName} (${a.address})` : a.address}
            </option>
          ))}
        </select>
        <Link
          href={`/app/mail/${account.id}/compose`}
          className="mb-1 flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium text-white"
          style={{ background: "var(--kb-primary)" }}
        >
          <PenSquare size={15} /> Compose
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {FOLDER_META.map((f) => {
          const active = activeFolder === f.key && !activeLabelId;
          const unread = counts[f.key] ?? 0;
          const Icon = f.icon;
          return (
            <Link
              key={f.key}
              href={`/app/mail/${account.id}/${f.key.toLowerCase()}`}
              className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
              style={{
                background: active ? "var(--kb-primary-soft, rgba(37,99,235,0.12))" : "transparent",
                color: active ? "var(--kb-primary)" : "var(--kb-text-primary)",
                fontWeight: active ? 600 : 400,
              }}
            >
              <span className="flex items-center gap-2">
                <Icon size={15} /> {f.label}
              </span>
              {unread > 0 && (
                <span
                  className="rounded-full px-1.5 text-xs"
                  style={{ background: "var(--kb-primary)", color: "#fff" }}
                >
                  {unread}
                </span>
              )}
            </Link>
          );
        })}

        {labels.length > 0 && (
          <div className="mt-4">
            <div className="px-2 pb-1 text-xs uppercase tracking-wide" style={{ color: "var(--kb-text-muted)" }}>
              Labels
            </div>
            {labels.map((l) => {
              const active = activeLabelId === l.id;
              return (
                <Link
                  key={l.id}
                  href={`/app/mail/${account.id}/label/${l.id}`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                  style={{
                    background: active ? "var(--kb-primary-soft, rgba(37,99,235,0.12))" : "transparent",
                    color: "var(--kb-text-primary)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="flex items-center gap-1 border-t p-2" style={{ borderColor: "var(--kb-border)" }}>
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs"
          style={{ color: "var(--kb-text-muted)" }}
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> Sync
        </button>
        <Link
          href={`/app/mail/${account.id}/settings`}
          className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs"
          style={{ color: "var(--kb-text-muted)" }}
        >
          <SettingsIcon size={13} /> Settings
        </Link>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------ message list */

function SearchBox({ accountId, initial }: { accountId: string; initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) router.push(`/app/mail/${accountId}/search?q=${encodeURIComponent(term)}`);
      }}
      className="flex items-center gap-2 border-b px-3 py-2"
      style={{ borderColor: "var(--kb-border)" }}
    >
      <SearchIcon size={15} style={{ color: "var(--kb-text-muted)" }} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search mail"
        className="w-full bg-transparent text-sm outline-none"
        style={{ color: "var(--kb-text-primary)" }}
      />
    </form>
  );
}

function MessageList({
  account,
  labels,
  messages,
  nextCursor,
  activeThreadId,
  title,
  searchInitial,
}: {
  account: MailAccount;
  labels: MailLabel[];
  messages: MailMessage[];
  nextCursor: string | null;
  activeThreadId: string | null;
  title: string;
  searchInitial: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursorIdx, setCursorIdx] = useState(0);
  const [labelMenu, setLabelMenu] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setCursorIdx(0);
  }, [messages]);

  const patch = useCallback(
    (ids: string[], body: Record<string, unknown>) => {
      startTransition(async () => {
        try {
          await api(`/api/mail/${account.id}/messages/${ids[0]}`, {
            method: "PATCH",
            body: JSON.stringify(ids.length > 1 ? { ids, ...body } : body),
          });
        } catch {
          /* ignore */
        }
        router.refresh();
      });
    },
    [account.id, router],
  );

  const openMessage = useCallback(
    (m: MailMessage) => {
      if (!m.isRead) patch([m.id], { isRead: true });
      router.push(`/app/mail/${account.id}/thread/${m.threadId}`);
    },
    [account.id, patch, router],
  );

  const selectedIds = useCallback(
    () => (selected.size > 0 ? [...selected] : messages[cursorIdx] ? [messages[cursorIdx]!.id] : []),
    [selected, messages, cursorIdx],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j") {
        setCursorIdx((i) => Math.min(i + 1, messages.length - 1));
      } else if (e.key === "k") {
        setCursorIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "e") {
        const ids = selectedIds();
        if (ids.length) patch(ids, { folder: "ARCHIVE" });
      } else if (e.key === "#") {
        const ids = selectedIds();
        if (ids.length) patch(ids, { folder: "TRASH" });
      } else if (e.key === "Enter") {
        const m = messages[cursorIdx];
        if (m) openMessage(m);
      } else if (e.key === "r") {
        const m = messages[cursorIdx];
        if (m) router.push(`/app/mail/${account.id}/thread/${m.threadId}`);
      } else if (e.key === "c") {
        router.push(`/app/mail/${account.id}/compose`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messages, cursorIdx, patch, openMessage, selectedIds, router, account.id]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyLabel(labelId: string) {
    const ids = selectedIds();
    startTransition(async () => {
      try {
        for (const id of ids) {
          await api(`/api/mail/${account.id}/messages/${id}/labels`, {
            method: "POST",
            body: JSON.stringify({ labelId }),
          });
        }
      } catch {
        /* ignore */
      }
      setLabelMenu(false);
      router.refresh();
    });
  }

  const hasSel = selected.size > 0;

  return (
    <div className="flex w-96 shrink-0 flex-col border-r" style={{ borderColor: "var(--kb-border)" }}>
      <SearchBox accountId={account.id} initial={searchInitial} />
      <div
        className="flex items-center justify-between px-3 py-2 text-sm font-semibold"
        style={{ color: "var(--kb-text-primary)" }}
      >
        <span>{title}</span>
        <span className="text-xs font-normal" style={{ color: "var(--kb-text-muted)" }}>
          {messages.length} {messages.length === 1 ? "message" : "messages"}
        </span>
      </div>

      {hasSel && (
        <div
          className="flex items-center gap-2 border-y px-3 py-1.5"
          style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)" }}
        >
          <button onClick={() => patch(selectedIds(), { isRead: true })} className="text-xs" style={{ color: "var(--kb-text-muted)" }}>
            Read
          </button>
          <button onClick={() => patch(selectedIds(), { isRead: false })} className="text-xs" style={{ color: "var(--kb-text-muted)" }}>
            Unread
          </button>
          <button onClick={() => patch(selectedIds(), { folder: "ARCHIVE" })} className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-muted)" }}>
            <Archive size={13} /> Archive
          </button>
          <button onClick={() => patch(selectedIds(), { folder: "TRASH" })} className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-muted)" }}>
            <Trash2 size={13} /> Trash
          </button>
          <div className="relative">
            <button onClick={() => setLabelMenu((v) => !v)} className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-muted)" }}>
              <Tag size={13} /> Label
            </button>
            {labelMenu && labels.length > 0 && (
              <div
                className="absolute z-10 mt-1 w-40 rounded border py-1 shadow-lg"
                style={{ borderColor: "var(--kb-border)", background: "var(--kb-surface)" }}
              >
                {labels.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => applyLabel(l.id)}
                    className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs"
                    style={{ color: "var(--kb-text-primary)" }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ul className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <li className="px-4 py-10 text-center text-sm" style={{ color: "var(--kb-text-muted)" }}>
            No messages here.
          </li>
        )}
        {messages.map((m, idx) => {
          const from = firstAddress(m.fromAddress);
          const isCursor = idx === cursorIdx;
          const active = m.threadId === activeThreadId;
          return (
            <li
              key={m.id}
              onClick={() => {
                setCursorIdx(idx);
                openMessage(m);
              }}
              className="flex cursor-pointer gap-2 border-b px-3 py-2"
              style={{
                borderColor: "var(--kb-border)",
                background: active
                  ? "var(--kb-primary-soft, rgba(37,99,235,0.10))"
                  : isCursor
                    ? "var(--kb-bg)"
                    : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(m.id)}
                className="mt-1 h-3.5 w-3.5"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  patch([m.id], { isStarred: !m.isStarred });
                }}
                className="mt-0.5"
                aria-label={m.isStarred ? "Unstar" : "Star"}
              >
                <Star
                  size={14}
                  fill={m.isStarred ? "#f59e0b" : "none"}
                  color={m.isStarred ? "#f59e0b" : "var(--kb-text-muted)"}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="truncate text-sm"
                    style={{
                      color: "var(--kb-text-primary)",
                      fontWeight: m.isRead ? 400 : 700,
                    }}
                  >
                    {from.name || from.email}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--kb-text-muted)" }}>
                    {fmtRelativeTime(m.receivedAt ?? m.sentAt ?? m.createdAt)}
                  </span>
                </div>
                <div
                  className="truncate text-sm"
                  style={{ color: "var(--kb-text-primary)", fontWeight: m.isRead ? 400 : 600 }}
                >
                  {m.subject || "(no subject)"}
                </div>
                <div className="truncate text-xs" style={{ color: "var(--kb-text-muted)" }}>
                  {m.snippet ?? ""}
                </div>
                {m.labels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.labels.map((ml) => (
                      <span
                        key={ml.labelId}
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{ background: ml.label.color, color: "#fff" }}
                      >
                        {ml.label.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {nextCursor && (
        <button
          onClick={() => router.push(`?cursor=${nextCursor}`)}
          className="border-t py-2 text-xs"
          style={{ borderColor: "var(--kb-border)", color: "var(--kb-primary)" }}
        >
          Load more
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- shell wrap */

export function MailShell(props: {
  accounts: MailAccount[];
  account: MailAccount;
  labels: MailLabel[];
  counts: Record<string, number>;
  messages: MailMessage[];
  nextCursor: string | null;
  activeFolder: string | null;
  activeLabelId: string | null;
  activeThreadId: string | null;
  listTitle: string;
  searchInitial?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <LeftRail
        accounts={props.accounts}
        account={props.account}
        labels={props.labels}
        counts={props.counts}
        activeFolder={props.activeFolder}
        activeLabelId={props.activeLabelId}
      />
      <MessageList
        account={props.account}
        labels={props.labels}
        messages={props.messages}
        nextCursor={props.nextCursor}
        activeThreadId={props.activeThreadId}
        title={props.listTitle}
        searchInitial={props.searchInitial ?? ""}
      />
      <section className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--kb-bg)" }}>
        {props.children ?? (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--kb-text-muted)" }}>
            Select a conversation to read.
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ thread reader */

function MessageBody({ m }: { m: ThreadMessage }) {
  const [open, setOpen] = useState(true);
  const from = firstAddress(m.fromAddress);
  const to = formatAddresses(m.toAddresses as string | string[] | null);
  return (
    <div className="border-b" style={{ borderColor: "var(--kb-border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
            {from.name || from.email}
          </div>
          <div className="truncate text-xs" style={{ color: "var(--kb-text-muted)" }}>
            to {to.map((t) => t.name || t.email).join(", ") || "(unknown)"}
          </div>
        </div>
        <span className="shrink-0 text-xs" style={{ color: "var(--kb-text-muted)" }}>
          {fmtDate(m.receivedAt ?? m.sentAt ?? m.createdAt)}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4">
          {m.bodyHtml ? (
            <div
              className="prose max-w-none text-sm"
              style={{ color: "var(--kb-text-primary)" }}
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(m.bodyHtml) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-primary)", fontFamily: "inherit" }}>
              {m.bodyText ?? ""}
            </pre>
          )}
          {m.attachments && m.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {m.attachments.map((a) => (
                <span
                  key={a.id}
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-muted)" }}
                >
                  {a.filename}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ThreadReader({
  account,
  subject,
  messages,
  signatures,
}: {
  account: MailAccount;
  subject: string;
  messages: ThreadMessage[];
  signatures: MailSignature[];
}) {
  const [replying, setReplying] = useState(false);
  const last = messages[messages.length - 1];
  const replyTo = last ? firstAddress(last.fromAddress).email : "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--kb-border)" }}>
        <h2 className="truncate text-base font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {subject || "(no subject)"}
        </h2>
        <button
          onClick={() => setReplying((v) => !v)}
          className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-white"
          style={{ background: "var(--kb-primary)" }}
        >
          <Reply size={14} /> Reply
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {messages.map((m) => (
          <MessageBody key={m.id} m={m} />
        ))}
      </div>
      {replying && last && (
        <div className="border-t" style={{ borderColor: "var(--kb-border)" }}>
          <Composer
            account={account}
            signatures={signatures}
            mode="reply"
            initial={{
              to: replyTo,
              subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
              inReplyTo: last.threadId,
            }}
            onDone={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- composer */

export function Composer({
  account,
  signatures,
  mode,
  initial,
  draftId,
  onDone,
}: {
  account: MailAccount;
  signatures: MailSignature[];
  mode: "full" | "reply";
  initial?: { to?: string; cc?: string; bcc?: string; subject?: string; body?: string; inReplyTo?: string | null };
  draftId?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const defaultSig = signatures.find((s) => s.isDefault);
  const [to, setTo] = useState(initial?.to ?? "");
  const [cc, setCc] = useState(initial?.cc ?? "");
  const [bcc, setBcc] = useState(initial?.bcc ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? (defaultSig ? `\n\n--\n${stripTags(defaultSig.html)}` : ""));
  const [showCc, setShowCc] = useState(Boolean(initial?.cc || initial?.bcc));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentDraft = useRef<string | null>(draftId ?? null);
  const inReplyTo = initial?.inReplyTo ?? null;

  const autosave = useCallback(async () => {
    if (!to && !subject && !body.trim()) return;
    try {
      const data = await api(`/api/mail/${account.id}/drafts`, {
        method: "POST",
        body: JSON.stringify({ id: currentDraft.current, to, cc, bcc, subject, body, inReplyTo }),
      });
      if (typeof data.id === "string") currentDraft.current = data.id;
    } catch {
      /* autosave is best-effort */
    }
  }, [account.id, to, cc, bcc, subject, body, inReplyTo]);

  useEffect(() => {
    const t = setInterval(autosave, 15000);
    return () => clearInterval(t);
  }, [autosave]);

  async function send() {
    setError(null);
    if (!to.trim()) {
      setError("At least one recipient is required.");
      return;
    }
    setSending(true);
    try {
      await api(`/api/mail/${account.id}/send`, {
        method: "POST",
        body: JSON.stringify({ to, cc, bcc, subject, body, inReplyTo, draftId: currentDraft.current }),
      });
      if (onDone) onDone();
      router.push(`/app/mail/${account.id}/sent`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  const field =
    "w-full border-b bg-transparent px-4 py-2 text-sm outline-none";
  const fieldStyle = { borderColor: "var(--kb-border)", color: "var(--kb-text-primary)" };

  return (
    <div className={mode === "full" ? "mx-auto flex w-full max-w-3xl flex-col" : "flex flex-col"}>
      {mode === "full" && (
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--kb-text-primary)" }}>
            New message
          </h2>
        </div>
      )}
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className={field} style={fieldStyle} />
      {!showCc && (
        <button
          onClick={() => setShowCc(true)}
          className="self-end px-4 py-1 text-xs"
          style={{ color: "var(--kb-primary)" }}
        >
          Cc / Bcc
        </button>
      )}
      {showCc && (
        <>
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc" className={field} style={fieldStyle} />
          <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Bcc" className={field} style={fieldStyle} />
        </>
      )}
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className={field}
        style={fieldStyle}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message"
        rows={mode === "full" ? 16 : 8}
        className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none"
        style={{ color: "var(--kb-text-primary)" }}
      />
      {error && (
        <div className="px-4 py-1 text-xs" style={{ color: "#dc2626" }}>
          {error}
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={send}
          disabled={sending}
          className="flex items-center gap-1 rounded px-4 py-2 text-sm text-white disabled:opacity-60"
          style={{ background: "var(--kb-primary)" }}
        >
          <Send size={14} /> {sending ? "Sending" : "Send"}
        </button>
        <button onClick={autosave} className="text-xs" style={{ color: "var(--kb-text-muted)" }}>
          Save draft
        </button>
        {onDone && (
          <button onClick={onDone} className="ml-auto text-xs" style={{ color: "var(--kb-text-muted)" }}>
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/* ---------------------------------------------------------------- settings */

export function SettingsPanel({
  account,
  labels,
  filters,
  signatures,
}: {
  account: MailAccount;
  labels: MailLabel[];
  filters: MailFilter[];
  signatures: MailSignature[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"labels" | "filters" | "signatures">("labels");
  const [busy, setBusy] = useState(false);

  function run(fn: () => Promise<void>) {
    setBusy(true);
    fn()
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        router.refresh();
      });
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        Mail settings
      </h1>
      <div className="mb-4 flex gap-2 border-b" style={{ borderColor: "var(--kb-border)" }}>
        {(["labels", "filters", "signatures"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-2 text-sm capitalize"
            style={{
              color: tab === t ? "var(--kb-primary)" : "var(--kb-text-muted)",
              borderBottom: tab === t ? "2px solid var(--kb-primary)" : "2px solid transparent",
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "labels" && (
        <LabelsTab account={account} labels={labels} busy={busy} run={run} />
      )}
      {tab === "filters" && (
        <FiltersTab account={account} filters={filters} labels={labels} busy={busy} run={run} />
      )}
      {tab === "signatures" && (
        <SignaturesTab account={account} signatures={signatures} busy={busy} run={run} />
      )}
    </div>
  );
}

function LabelsTab({
  account,
  labels,
  busy,
  run,
}: {
  account: MailAccount;
  labels: MailLabel[];
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New label name"
          className="flex-1 rounded border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--kb-border)", background: "var(--kb-surface)", color: "var(--kb-text-primary)" }}
        />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10" />
        <button
          disabled={busy || !name.trim()}
          onClick={() =>
            run(async () => {
              await api(`/api/mail/${account.id}/labels`, {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), color }),
              });
              setName("");
            })
          }
          className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-white"
          style={{ background: "var(--kb-primary)" }}
        >
          <Plus size={14} /> Add
        </button>
      </div>
      <ul>
        {labels.map((l) => (
          <li
            key={l.id}
            className="flex items-center justify-between border-b py-2"
            style={{ borderColor: "var(--kb-border)" }}
          >
            <span className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
              <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
            <button
              onClick={() =>
                run(async () => {
                  await api(`/api/mail/${account.id}/labels/${l.id}`, { method: "DELETE" });
                })
              }
              style={{ color: "var(--kb-text-muted)" }}
            >
              <X size={15} />
            </button>
          </li>
        ))}
        {labels.length === 0 && <li className="py-3 text-sm" style={{ color: "var(--kb-text-muted)" }}>No labels yet.</li>}
      </ul>
    </div>
  );
}

function FiltersTab({
  account,
  filters,
  labels,
  busy,
  run,
}: {
  account: MailAccount;
  filters: MailFilter[];
  labels: MailLabel[];
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState("");
  const [field, setField] = useState("from");
  const [op, setOp] = useState("contains");
  const [value, setValue] = useState("");
  const [actionType, setActionType] = useState("APPLY_LABEL");
  const [actionValue, setActionValue] = useState(labels[0]?.id ?? "");

  return (
    <div>
      <div
        className="mb-4 space-y-2 rounded border p-3"
        style={{ borderColor: "var(--kb-border)", background: "var(--kb-surface)" }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Filter name"
          className="w-full rounded border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)", color: "var(--kb-text-primary)" }}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <span>If</span>
          <select value={field} onChange={(e) => setField(e.target.value)} className="rounded border px-1 py-1" style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)" }}>
            <option value="from">from</option>
            <option value="subject">subject</option>
            <option value="body">body</option>
          </select>
          <select value={op} onChange={(e) => setOp(e.target.value)} className="rounded border px-1 py-1" style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)" }}>
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="regex">regex</option>
          </select>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            className="rounded border px-2 py-1"
            style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)", color: "var(--kb-text-primary)" }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <span>then</span>
          <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="rounded border px-1 py-1" style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)" }}>
            <option value="APPLY_LABEL">apply label</option>
            <option value="MOVE">move to</option>
            <option value="MARK_READ">mark read</option>
            <option value="STAR">star</option>
          </select>
          {actionType === "APPLY_LABEL" && (
            <select value={actionValue} onChange={(e) => setActionValue(e.target.value)} className="rounded border px-1 py-1" style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)" }}>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {actionType === "MOVE" && (
            <select value={actionValue} onChange={(e) => setActionValue(e.target.value)} className="rounded border px-1 py-1" style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)" }}>
              {FOLDER_META.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          disabled={busy || !name.trim() || !value.trim()}
          onClick={() =>
            run(async () => {
              const action: Record<string, unknown> = { type: actionType };
              if (actionType === "APPLY_LABEL" || actionType === "MOVE") action.value = actionValue;
              await api(`/api/mail/${account.id}/filters`, {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), condition: { field, op, value: value.trim() }, action }),
              });
              setName("");
              setValue("");
            })
          }
          className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-white"
          style={{ background: "var(--kb-primary)" }}
        >
          <Plus size={14} /> Create filter
        </button>
      </div>

      <ul>
        {filters.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between border-b py-2 text-sm"
            style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-primary)" }}
          >
            <span>{f.name}</span>
            <span className="flex items-center gap-3">
              <button
                onClick={() =>
                  run(async () => {
                    await api(`/api/mail/${account.id}/filters/${f.id}/run`, { method: "POST" });
                  })
                }
                className="text-xs"
                style={{ color: "var(--kb-primary)" }}
              >
                Run now
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    await api(`/api/mail/${account.id}/filters/${f.id}`, { method: "DELETE" });
                  })
                }
                style={{ color: "var(--kb-text-muted)" }}
              >
                <X size={15} />
              </button>
            </span>
          </li>
        ))}
        {filters.length === 0 && <li className="py-3 text-sm" style={{ color: "var(--kb-text-muted)" }}>No filters yet.</li>}
      </ul>
    </div>
  );
}

function SignaturesTab({
  account,
  signatures,
  busy,
  run,
}: {
  account: MailAccount;
  signatures: MailSignature[];
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [isDefault, setIsDefault] = useState(signatures.length === 0);
  return (
    <div>
      <div
        className="mb-4 space-y-2 rounded border p-3"
        style={{ borderColor: "var(--kb-border)", background: "var(--kb-surface)" }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Signature name"
          className="w-full rounded border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)", color: "var(--kb-text-primary)" }}
        />
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder="Signature HTML"
          rows={4}
          className="w-full rounded border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--kb-border)", background: "var(--kb-bg)", color: "var(--kb-text-primary)" }}
        />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Set as default
        </label>
        <button
          disabled={busy || !name.trim()}
          onClick={() =>
            run(async () => {
              await api(`/api/mail/${account.id}/signatures`, {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), html, isDefault }),
              });
              setName("");
              setHtml("");
            })
          }
          className="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-white"
          style={{ background: "var(--kb-primary)" }}
        >
          <Plus size={14} /> Add signature
        </button>
      </div>
      <ul>
        {signatures.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between border-b py-2 text-sm"
            style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-primary)" }}
          >
            <span className="flex items-center gap-2">
              {s.name || "(unnamed)"}
              {s.isDefault && (
                <span className="rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: "var(--kb-primary)" }}>
                  default
                </span>
              )}
            </span>
            <button
              onClick={() =>
                run(async () => {
                  await api(`/api/mail/${account.id}/signatures/${s.id}`, { method: "DELETE" });
                })
              }
              style={{ color: "var(--kb-text-muted)" }}
            >
              <X size={15} />
            </button>
          </li>
        ))}
        {signatures.length === 0 && <li className="py-3 text-sm" style={{ color: "var(--kb-text-muted)" }}>No signatures yet.</li>}
      </ul>
    </div>
  );
}
