"use client";

/*
 * Feed composer (Sprint 21). "use client" and exports ONLY React components.
 * Pure helpers live in src/lib/feed/feed-utils.ts. The composer posts to
 * /api/feed/posts and refreshes the route on success. Supports a title, body
 * with @mentions, visibility, an optional poll, and a simple shared-record ref.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ComposerMember = { clerkUserId: string; displayName: string | null; email: string | null };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return res.json().catch(() => ({ ok: false }));
}

const inputStyle = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius)",
  backgroundColor: "var(--kb-bg)",
  color: "var(--kb-text-primary)",
} as const;

export function FeedComposer({ members, workgroupId }: { members: ComposerMember[]; workgroupId?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"POST" | "ANNOUNCEMENT" | "QUESTION">("POST");
  const [visibility, setVisibility] = useState<"PUBLIC" | "DIRECT">("PUBLIC");
  const [pinned, setPinned] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [sharedRecordType, setSharedRecordType] = useState("");
  const [sharedRecordId, setSharedRecordId] = useState("");
  const [pollOn, setPollOn] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setBody("");
    setType("POST");
    setVisibility("PUBLIC");
    setPinned(false);
    setAttachmentUrl("");
    setSharedRecordType("");
    setSharedRecordId("");
    setPollOn(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollMultiple(false);
    setError(null);
  }

  function submit() {
    if (!body.trim()) {
      setError("Write something first.");
      return;
    }
    const poll = pollOn
      ? { question: pollQuestion, options: pollOptions.filter((o) => o.trim()), allowMultiple: pollMultiple }
      : null;
    if (poll && (!poll.question.trim() || poll.options.length < 2)) {
      setError("A poll needs a question and at least two options.");
      return;
    }
    const attachments = attachmentUrl.trim() ? [{ name: attachmentUrl.trim(), url: attachmentUrl.trim() }] : null;
    start(async () => {
      const res = await api("/api/feed/posts", {
        method: "POST",
        body: JSON.stringify({
          type,
          title: title.trim() || null,
          body: body.trim(),
          visibility,
          pinned,
          attachments,
          sharedRecordType: sharedRecordType || null,
          sharedRecordId: sharedRecordId.trim() || null,
          workgroupId: workgroupId ?? null,
          poll,
        }),
      });
      if (!res.ok) {
        setError(res.error || "Could not post.");
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 w-full rounded p-3 text-left text-sm"
        style={{ ...inputStyle, color: "var(--kb-text-secondary)" }}
      >
        Share an update with your team...
      </button>
    );
  }

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded p-4"
      style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}
    >
      <div className="flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as never)} className="p-2 text-sm" style={inputStyle}>
          <option value="POST">Post</option>
          <option value="ANNOUNCEMENT">Announcement</option>
          <option value="QUESTION">Question</option>
        </select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as never)} className="p-2 text-sm" style={inputStyle}>
          <option value="PUBLIC">Public</option>
          <option value="DIRECT">Direct</option>
        </select>
        <label className="flex items-center gap-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin
        </label>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="p-2 text-sm"
        style={inputStyle}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind? Use @username to mention someone."
        rows={4}
        className="p-2 text-sm"
        style={inputStyle}
      />

      {members.length > 0 && (
        <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          Mention: {members.slice(0, 8).map((m) => `@${m.clerkUserId}`).join("  ")}
        </p>
      )}

      <input
        value={attachmentUrl}
        onChange={(e) => setAttachmentUrl(e.target.value)}
        placeholder="Attachment URL (optional)"
        className="p-2 text-sm"
        style={inputStyle}
      />

      <div className="flex flex-wrap gap-2">
        <select value={sharedRecordType} onChange={(e) => setSharedRecordType(e.target.value)} className="p-2 text-sm" style={inputStyle}>
          <option value="">Share a record (optional)</option>
          <option value="DEAL">Deal</option>
          <option value="CONTACT">Contact</option>
          <option value="TASK">Task</option>
          <option value="DOCUMENT">Document</option>
        </select>
        {sharedRecordType && (
          <input
            value={sharedRecordId}
            onChange={(e) => setSharedRecordId(e.target.value)}
            placeholder="Record id"
            className="flex-1 p-2 text-sm"
            style={inputStyle}
          />
        )}
      </div>

      <label className="flex items-center gap-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        <input type="checkbox" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} /> Add a poll
      </label>
      {pollOn && (
        <div className="flex flex-col gap-2 rounded p-3" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
          <input
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder="Poll question"
            className="p-2 text-sm"
            style={inputStyle}
          />
          {pollOptions.map((opt, i) => (
            <input
              key={i}
              value={opt}
              onChange={(e) => setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
              placeholder={`Option ${i + 1}`}
              className="p-2 text-sm"
              style={inputStyle}
            />
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPollOptions((prev) => [...prev, ""])}
              className="text-xs underline"
              style={{ color: "var(--kb-text-secondary)" }}
            >
              Add option
            </button>
            <label className="flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
              <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} /> Allow multiple
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: "var(--kb-danger, #dc2626)" }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="rounded px-3 py-2 text-sm"
          style={{ ...inputStyle }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
