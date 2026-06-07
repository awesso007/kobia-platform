"use client";

/*
 * Chat client components (Sprint 16). This file is "use client" and exports ONLY
 * React components. All pure utilities live in src/lib/chat/chat-utils.ts (no
 * "use client") so server pages can import them without turning them into
 * client-reference proxies, which crash at SSR in production. Do not add
 * non-component exports here.
 *
 * The shell polls the messages endpoint every 5s while a channel is open. The
 * composer supports @mention autocomplete (against the members list) and a
 * simple attachment URL field. Message hover actions: reply-in-thread, react,
 * edit (author), delete (author/admin), pin.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fmtClock,
  fmtRelativeTime,
  unreadBadge,
} from "@/lib/chat/chat-utils";

type Member = { userId: string; name: string; email: string | null };

type ChannelSummary = {
  id: string;
  name: string;
  slug: string;
  kind: "PUBLIC" | "PRIVATE" | "DM" | "GROUP_DM";
  description: string | null;
  isArchived: boolean;
  unreadCount: number;
  lastMessageAt: string | Date | null;
};

type ChatMessage = {
  id: string;
  channelId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  bodyText: string;
  editedAt: string | Date | null;
  createdAt: string | Date;
  reactions: Array<{ emoji: string; userId: string }>;
  replyCount: number;
};

const REACTION_LABELS = ["thumbsup", "heart", "tada", "eyes", "rocket"];

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return res.json().catch(() => ({ ok: false }));
}

function channelPrefix(kind: ChannelSummary["kind"]): string {
  return kind === "PUBLIC" ? "#" : kind === "PRIVATE" ? "lock " : "";
}

export function ChatSidebar({
  channels,
  activeId,
}: {
  channels: ChannelSummary[];
  activeId?: string;
}) {
  const grouped = useMemo(() => {
    const rooms = channels.filter((c) => c.kind === "PUBLIC" || c.kind === "PRIVATE");
    const dms = channels.filter((c) => c.kind === "DM" || c.kind === "GROUP_DM");
    return { rooms, dms };
  }, [channels]);

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r"
      style={{ borderColor: "var(--kb-border)", backgroundColor: "var(--kb-surface)" }}
    >
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          Chat
        </span>
        <Link href="/app/chat/settings" className="text-xs underline" style={{ color: "var(--kb-text-secondary)" }}>
          Settings
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 text-sm">
        <SidebarGroup title="Channels" newHref="/app/chat?new=channel">
          {grouped.rooms.map((c) => (
            <SidebarItem key={c.id} channel={c} active={c.id === activeId} />
          ))}
        </SidebarGroup>
        <SidebarGroup title="Direct messages" newHref="/app/chat/dm/new">
          {grouped.dms.map((c) => (
            <SidebarItem key={c.id} channel={c} active={c.id === activeId} />
          ))}
        </SidebarGroup>
      </nav>
    </aside>
  );
}

function SidebarGroup({ title, newHref, children }: { title: string; newHref: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--kb-text-secondary)" }}>
          {title}
        </span>
        <Link href={newHref} className="text-xs" style={{ color: "var(--kb-text-secondary)" }} aria-label={`New ${title}`}>
          +
        </Link>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SidebarItem({ channel, active }: { channel: ChannelSummary; active: boolean }) {
  const badge = unreadBadge(channel.unreadCount);
  return (
    <Link
      href={`/app/chat/${channel.id}`}
      className="flex items-center justify-between rounded px-2 py-1.5"
      style={{
        backgroundColor: active ? "var(--kb-surface-2, #f1f5f9)" : "transparent",
        color: "var(--kb-text-primary)",
        fontWeight: channel.unreadCount > 0 ? 600 : 400,
      }}
    >
      <span className="truncate">
        {channelPrefix(channel.kind)}
        {channel.name}
      </span>
      {badge ? (
        <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">{badge}</span>
      ) : null}
    </Link>
  );
}

function ReactionBar({ reactions }: { reactions: ChatMessage["reactions"] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reactions) m.set(r.emoji, (m.get(r.emoji) ?? 0) + 1);
    return Array.from(m.entries());
  }, [reactions]);
  if (counts.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {counts.map(([emoji, n]) => (
        <span
          key={emoji}
          className="rounded-full border px-2 py-0.5 text-[11px]"
          style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}
        >
          {emoji} {n}
        </span>
      ))}
    </div>
  );
}

export function EmojiPicker({ onPick }: { onPick: (label: string) => void }) {
  return (
    <div className="flex gap-1">
      {REACTION_LABELS.map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(label)}
          className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-slate-100"
          style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function MessageItem({
  message,
  currentUserId,
  onChanged,
}: {
  message: ChatMessage;
  currentUserId: string;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.bodyText);
  const [showReact, setShowReact] = useState(false);
  const [pending, start] = useTransition();
  const isAuthor = message.authorId === currentUserId;

  async function react(label: string) {
    setShowReact(false);
    await api(`/api/chat/messages/${message.id}/react`, { method: "POST", body: JSON.stringify({ emoji: label }) });
    onChanged();
  }
  async function saveEdit() {
    await api(`/api/chat/messages/${message.id}`, { method: "PATCH", body: JSON.stringify({ bodyText: draft }) });
    setEditing(false);
    onChanged();
  }
  async function del() {
    await api(`/api/chat/messages/${message.id}`, { method: "DELETE" });
    onChanged();
  }
  async function pin() {
    await api(`/api/chat/messages/${message.id}/pin`, { method: "POST" });
    onChanged();
  }

  return (
    <div className="group flex flex-col px-4 py-1.5 hover:bg-slate-50">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {message.authorName}
        </span>
        <span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }} title={String(message.createdAt)}>
          {fmtClock(message.createdAt)}
        </span>
        {message.editedAt ? (
          <span className="text-[10px]" style={{ color: "var(--kb-text-secondary)" }}>
            (edited)
          </span>
        ) : null}
        <span className="ml-auto hidden gap-2 text-[11px] group-hover:flex" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href={`/app/chat/${message.channelId}/thread/${message.id}`} className="underline">
            Reply
          </Link>
          <button type="button" onClick={() => setShowReact((s) => !s)} className="underline">
            React
          </button>
          <button type="button" onClick={pin} className="underline">
            Pin
          </button>
          {isAuthor ? (
            <button type="button" onClick={() => setEditing((e) => !e)} className="underline">
              Edit
            </button>
          ) : null}
          {isAuthor ? (
            <button type="button" onClick={() => start(del)} disabled={pending} className="underline">
              Delete
            </button>
          ) : null}
        </span>
      </div>

      {editing ? (
        <div className="mt-1 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--kb-border)" }}
          />
          <button type="button" onClick={saveEdit} className="rounded bg-slate-900 px-3 text-sm text-white">
            Save
          </button>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-primary)" }}>
          {message.bodyText}
        </p>
      )}

      {showReact ? <div className="mt-1"><EmojiPicker onPick={react} /></div> : null}
      <ReactionBar reactions={message.reactions} />
      {message.replyCount > 0 ? (
        <Link
          href={`/app/chat/${message.channelId}/thread/${message.id}`}
          className="mt-1 text-[11px] underline"
          style={{ color: "var(--kb-text-secondary)" }}
        >
          {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
        </Link>
      ) : null}
      <span className="sr-only">{fmtRelativeTime(message.createdAt)}</span>
      <span className="hidden">{router ? "" : ""}</span>
    </div>
  );
}

export function MessageList({
  messages,
  currentUserId,
  onChanged,
}: {
  messages: ChatMessage[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="grid flex-1 place-items-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        No messages yet. Say hello.
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto py-2">
      {messages.map((m) => (
        <MessageItem key={m.id} message={m} currentUserId={currentUserId} onChanged={onChanged} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

export function MessageComposer({
  channelId,
  members,
  parentId,
  onSent,
}: {
  channelId: string;
  members: Member[];
  parentId?: string | null;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [pending, start] = useTransition();
  const [suggest, setSuggest] = useState<Member[]>([]);

  function onChange(v: string) {
    setText(v);
    const m = /@([A-Za-z0-9_]*)$/.exec(v);
    if (m) {
      const q = (m[1] ?? "").toLowerCase();
      setSuggest(members.filter((mem) => mem.name.toLowerCase().includes(q) || mem.userId.toLowerCase().includes(q)).slice(0, 5));
    } else {
      setSuggest([]);
    }
  }

  function applyMention(userId: string) {
    setText((t) => t.replace(/@([A-Za-z0-9_]*)$/, `@${userId} `));
    setSuggest([]);
  }

  function send() {
    const bodyText = text.trim();
    if (!bodyText) return;
    start(async () => {
      await api(`/api/chat/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          bodyText,
          parentId: parentId ?? null,
          attachments: attachment.trim() ? [{ url: attachment.trim() }] : null,
        }),
      });
      setText("");
      setAttachment("");
      setShowAttach(false);
      onSent();
    });
  }

  return (
    <div className="border-t p-3" style={{ borderColor: "var(--kb-border)" }}>
      {suggest.length > 0 ? (
        <div className="mb-1 rounded border text-sm" style={{ borderColor: "var(--kb-border)" }}>
          {suggest.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => applyMention(m.userId)}
              className="block w-full px-2 py-1 text-left hover:bg-slate-100"
            >
              {m.name} <span style={{ color: "var(--kb-text-secondary)" }}>@{m.userId}</span>
            </button>
          ))}
        </div>
      ) : null}
      {showAttach ? (
        <input
          value={attachment}
          onChange={(e) => setAttachment(e.target.value)}
          placeholder="Attachment URL"
          className="mb-1 w-full rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--kb-border)" }}
        />
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Write a message. Use @ to mention."
          className="flex-1 resize-none rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--kb-border)" }}
        />
        <button
          type="button"
          onClick={() => setShowAttach((s) => !s)}
          className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}
        >
          Attach
        </button>
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export function ChannelInfo({
  channel,
  pinned,
}: {
  channel: {
    name: string;
    kind: ChannelSummary["kind"];
    description: string | null;
    members: Array<{ userId: string; displayName: string; role: string }>;
  };
  pinned: Array<{ pinId: string; messageId: string; authorName: string; bodyText: string }>;
}) {
  return (
    <aside
      className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l p-4 lg:flex"
      style={{ borderColor: "var(--kb-border)", backgroundColor: "var(--kb-surface)" }}
    >
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {channelPrefix(channel.kind)}
          {channel.name}
        </h3>
        {channel.description ? (
          <p className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            {channel.description}
          </p>
        ) : null}
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--kb-text-secondary)" }}>
          Pinned
        </h4>
        {pinned.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            No pinned messages.
          </p>
        ) : (
          <ul className="space-y-1">
            {pinned.map((p) => (
              <li key={p.pinId} className="text-xs" style={{ color: "var(--kb-text-primary)" }}>
                <span className="font-medium">{p.authorName}: </span>
                {p.bodyText.slice(0, 80)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--kb-text-secondary)" }}>
          Members ({channel.members.length})
        </h4>
        <ul className="space-y-1">
          {channel.members.map((m) => (
            <li key={m.userId} className="text-xs" style={{ color: "var(--kb-text-primary)" }}>
              {m.displayName} {m.role === "ADMIN" ? <span style={{ color: "var(--kb-text-secondary)" }}>(admin)</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/** Channel view: polls messages every 5s, marks read, renders composer. */
export function ChannelView({
  channelId,
  channelName,
  channelKind,
  currentUserId,
  members,
  initialMessages,
}: {
  channelId: string;
  channelName: string;
  channelKind: ChannelSummary["kind"];
  currentUserId: string;
  members: Member[];
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  async function refresh() {
    const res = await api(`/api/chat/channels/${channelId}/messages`);
    if (res.ok && Array.isArray(res.messages)) {
      setMessages(res.messages as ChatMessage[]);
      const last = res.messages[res.messages.length - 1] as ChatMessage | undefined;
      await api(`/api/chat/channels/${channelId}/read`, {
        method: "POST",
        body: JSON.stringify({ upToMessageId: last?.id ?? null }),
      });
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {channelPrefix(channelKind)}
          {channelName}
        </h2>
      </div>
      <MessageList messages={messages} currentUserId={currentUserId} onChanged={() => void refresh()} />
      <MessageComposer channelId={channelId} members={members} onSent={() => void refresh()} />
    </div>
  );
}

/** Thread view: parent message + its replies, with a reply composer. */
export function ThreadView({
  channelId,
  parentId,
  currentUserId,
  members,
  initialReplies,
}: {
  channelId: string;
  parentId: string;
  currentUserId: string;
  members: Member[];
  initialReplies: ChatMessage[];
}) {
  const [replies, setReplies] = useState<ChatMessage[]>(initialReplies);
  async function refresh() {
    const res = await api(`/api/chat/channels/${channelId}/messages?parentId=${parentId}`);
    if (res.ok && Array.isArray(res.messages)) setReplies(res.messages as ChatMessage[]);
  }
  useEffect(() => {
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
        <Link href={`/app/chat/${channelId}`} className="text-xs underline" style={{ color: "var(--kb-text-secondary)" }}>
          Back to channel
        </Link>
        <h2 className="mt-1 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          Thread
        </h2>
      </div>
      <MessageList messages={replies} currentUserId={currentUserId} onChanged={() => void refresh()} />
      <MessageComposer channelId={channelId} members={members} parentId={parentId} onSent={() => void refresh()} />
    </div>
  );
}

/** New-channel form (used by /app/chat?new=channel). */
export function NewChannelForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [pending, start] = useTransition();

  function create() {
    if (!name.trim()) return;
    start(async () => {
      const res = await api("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, description, kind }),
      });
      if (res.ok && res.id) router.push(`/app/chat/${res.id}`);
    });
  }

  return (
    <div className="max-w-md p-6">
      <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        New channel
      </h2>
      <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        Name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-3 w-full rounded border px-2 py-1.5 text-sm"
        style={{ borderColor: "var(--kb-border)" }}
      />
      <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        Description
      </label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="mb-3 w-full rounded border px-2 py-1.5 text-sm"
        style={{ borderColor: "var(--kb-border)" }}
      />
      <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        Visibility
      </label>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as "PUBLIC" | "PRIVATE")}
        className="mb-4 w-full rounded border px-2 py-1.5 text-sm"
        style={{ borderColor: "var(--kb-border)" }}
      >
        <option value="PUBLIC">Public</option>
        <option value="PRIVATE">Private</option>
      </select>
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        Create channel
      </button>
    </div>
  );
}

/** Per-channel notification preferences (used by /app/chat/settings). */
export function ChatSettings({
  channels,
  initialPrefs,
}: {
  channels: Array<{ id: string; name: string; kind: ChannelSummary["kind"] }>;
  initialPrefs: Record<string, "ALL" | "MENTIONS" | "NONE">;
}) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState<string | null>(null);

  async function setLevel(channelId: string, level: "ALL" | "MENTIONS" | "NONE") {
    setPrefs((p) => ({ ...p, [channelId]: level }));
    setSaving(channelId);
    await api("/api/chat/prefs", { method: "POST", body: JSON.stringify({ channelId, level }) });
    setSaving(null);
  }

  return (
    <div className="max-w-2xl p-6">
      <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        Notification preferences
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: "var(--kb-text-secondary)" }}>
            <th className="py-2 text-left font-medium">Channel</th>
            <th className="py-2 text-left font-medium">Notify me about</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.id} className="border-t" style={{ borderColor: "var(--kb-border)" }}>
              <td className="py-2" style={{ color: "var(--kb-text-primary)" }}>
                {channelPrefix(c.kind)}
                {c.name}
              </td>
              <td className="py-2">
                <select
                  value={prefs[c.id] ?? "ALL"}
                  onChange={(e) => setLevel(c.id, e.target.value as "ALL" | "MENTIONS" | "NONE")}
                  disabled={saving === c.id}
                  className="rounded border px-2 py-1 text-sm"
                  style={{ borderColor: "var(--kb-border)" }}
                >
                  <option value="ALL">All messages</option>
                  <option value="MENTIONS">Mentions only</option>
                  <option value="NONE">Nothing</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** New-DM picker (used by /app/chat/dm/new). */
export function NewDmPicker({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const others = members.filter((m) => m.userId !== currentUserId);

  function startDm(userId: string) {
    start(async () => {
      const res = await api("/api/chat/dm", { method: "POST", body: JSON.stringify({ userId }) });
      if (res.ok && res.id) router.push(`/app/chat/${res.id}`);
    });
  }

  return (
    <div className="max-w-md p-6">
      <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        New direct message
      </h2>
      <ul className="divide-y rounded border" style={{ borderColor: "var(--kb-border)" }}>
        {others.map((m) => (
          <li key={m.userId}>
            <button
              type="button"
              onClick={() => startDm(m.userId)}
              disabled={pending}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              style={{ color: "var(--kb-text-primary)" }}
            >
              {m.name} <span style={{ color: "var(--kb-text-secondary)" }}>{m.email}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
