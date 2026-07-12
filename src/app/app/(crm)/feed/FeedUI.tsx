"use client";

/*
 * Feed client components (Sprint 21). "use client" and exports ONLY React
 * components. All pure helpers live in src/lib/feed/feed-utils.ts (no
 * "use client") so server pages can import them without turning them into
 * client-reference proxies. Do not add non-component exports here.
 *
 * Interactions POST to /api/feed/**; on success we refresh the route so the
 * server-rendered data stays the source of truth.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fmtRelativeTime,
  summarizeReactions,
  postTypeLabel,
  pollPercentages,
  REACTION_KINDS,
  REACTION_LABELS,
  type ReactionKind,
} from "@/lib/feed/feed-utils";

type ReactionGroup = { kind: string; userIds: string[] };
type PollOption = { id: string; label: string; order: number };
type Poll = {
  id: string;
  question: string;
  allowMultiple: boolean;
  closedAt: string | Date | null;
  closesAt: string | Date | null;
  options: PollOption[];
  voteCounts?: number[];
};

export type PostCardData = {
  id: string;
  authorId: string;
  type: string;
  title: string | null;
  body: string;
  pinned: boolean;
  visibility: string;
  commentCount: number;
  reactionCount: number;
  viewCount: number;
  sharedRecordType?: string | null;
  sharedRecordId?: string | null;
  createdAt: string | Date;
  reactionGroups: ReactionGroup[];
  poll: Poll | null;
};

export type CommentData = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  authorId: string;
  body: string;
  createdAt: string | Date;
  reactionGroups: ReactionGroup[];
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return res.json().catch(() => ({ ok: false }));
}

const card = {
  backgroundColor: "var(--kb-surface)",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius)",
} as const;

function userReacted(groups: ReactionGroup[], kind: string, userId: string | null): boolean {
  if (!userId) return false;
  const g = groups.find((x) => x.kind === kind);
  return Boolean(g?.userIds.includes(userId));
}

function ReactionBar({
  target,
  groups,
  currentUserId,
}: {
  target: { postId?: string; commentId?: string };
  groups: ReactionGroup[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const summary = summarizeReactions(groups);

  function toggle(kind: ReactionKind) {
    start(async () => {
      await api("/api/feed/reactions", { method: "POST", body: JSON.stringify({ ...target, kind }) });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {summary.map((r) => (
        <span key={r.kind} className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          {r.label} {r.count}
        </span>
      ))}
      <div className="flex gap-1">
        {REACTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={pending}
            onClick={() => toggle(kind)}
            title={REACTION_LABELS[kind]}
            className="rounded px-2 py-1 text-xs"
            style={{
              border: "1px solid var(--kb-border)",
              borderRadius: "var(--kb-radius)",
              backgroundColor: userReacted(groups, kind, currentUserId) ? "var(--kb-bg-hover, #eef2ff)" : "transparent",
              color: "var(--kb-text-secondary)",
            }}
          >
            {REACTION_LABELS[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}

function PollView({ poll, currentUserId }: { poll: Poll; currentUserId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const counts = poll.voteCounts ?? poll.options.map(() => 0);
  const pcts = pollPercentages(counts);
  const closed = Boolean(poll.closedAt);

  function toggleOption(id: string) {
    if (poll.allowMultiple) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelected([id]);
    }
  }

  function submit() {
    if (selected.length === 0) return;
    start(async () => {
      await api(`/api/feed/polls/${poll.id}/vote`, { method: "POST", body: JSON.stringify({ optionIds: selected }) });
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded p-3" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>{poll.question}</p>
      {poll.options.map((opt, i) => (
        <label key={opt.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {!closed && (
            <input
              type={poll.allowMultiple ? "checkbox" : "radio"}
              name={`poll-${poll.id}`}
              checked={selected.includes(opt.id)}
              onChange={() => toggleOption(opt.id)}
              disabled={!currentUserId}
            />
          )}
          <span className="flex-1">{opt.label}</span>
          <span className="text-xs">{pcts[i] ?? 0}% ({counts[i] ?? 0})</span>
        </label>
      ))}
      {closed ? (
        <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Poll closed.</p>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.length === 0}
          className="self-start rounded px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff", opacity: pending || selected.length === 0 ? 0.6 : 1 }}
        >
          Vote
        </button>
      )}
    </div>
  );
}

function AuthorLine({ authorId, createdAt, type, pinned }: { authorId: string; createdAt: string | Date; type: string; pinned: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
      <span className="font-medium" style={{ color: "var(--kb-text-primary)" }}>{authorId}</span>
      <span>{fmtRelativeTime(createdAt)}</span>
      {type !== "POST" && <span className="rounded px-1" style={{ border: "1px solid var(--kb-border)" }}>{postTypeLabel(type)}</span>}
      {pinned && <span style={{ color: "var(--kb-primary, #2563eb)" }}>Pinned</span>}
    </div>
  );
}

export function PostCard({
  post,
  currentUserId,
  canPin,
}: {
  post: PostCardData;
  currentUserId: string | null;
  canPin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isAuthor = currentUserId === post.authorId;

  function pin() {
    start(async () => {
      await api(`/api/feed/posts/${post.id}/pin`, { method: "POST" });
      router.refresh();
    });
  }
  function remove() {
    if (!confirm("Delete this post?")) return;
    start(async () => {
      await api(`/api/feed/posts/${post.id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <article className="mb-4 flex flex-col gap-3 p-4" style={card}>
      <div className="flex items-start justify-between">
        <AuthorLine authorId={post.authorId} createdAt={post.createdAt} type={post.type} pinned={post.pinned} />
        <div className="flex gap-2 text-xs">
          {canPin && (
            <button type="button" disabled={pending} onClick={pin} className="underline" style={{ color: "var(--kb-text-secondary)" }}>
              {post.pinned ? "Unpin" : "Pin"}
            </button>
          )}
          {(isAuthor || canPin) && (
            <button type="button" disabled={pending} onClick={remove} className="underline" style={{ color: "var(--kb-text-secondary)" }}>
              Delete
            </button>
          )}
        </div>
      </div>

      {post.title && <h3 className="text-base font-semibold" style={{ color: "var(--kb-text-primary)" }}>{post.title}</h3>}
      <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-primary)" }}>{post.body}</p>

      {post.sharedRecordType && (
        <div className="rounded p-2 text-xs" style={{ border: "1px dashed var(--kb-border)", color: "var(--kb-text-secondary)" }}>
          Shared {post.sharedRecordType.toLowerCase()}: {post.sharedRecordId}
        </div>
      )}

      {post.poll && <PollView poll={post.poll} currentUserId={currentUserId} />}

      <ReactionBar target={{ postId: post.id }} groups={post.reactionGroups} currentUserId={currentUserId} />

      <div className="flex gap-4 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        <Link href={`/app/feed/posts/${post.id}`} className="underline">
          {post.commentCount} comments
        </Link>
        <span>{post.viewCount} views</span>
      </div>
    </article>
  );
}

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "announcements", label: "Announcements" },
  { key: "mentions", label: "Mentions" },
  { key: "mine", label: "My posts" },
];

export function FeedStream({
  posts,
  nextCursor,
  currentUserId,
  filter,
  canPin,
}: {
  posts: PostCardData[];
  nextCursor: string | null;
  currentUserId: string | null;
  filter: string;
  canPin: boolean;
}) {
  const [items, setItems] = useState<PostCardData[]>(posts);
  const [cursor, setCursor] = useState<string | null>(nextCursor);
  const [pending, start] = useTransition();

  function loadMore() {
    if (!cursor) return;
    start(async () => {
      const res = await api(`/api/feed/posts?filter=${filter}&cursor=${cursor}`);
      if (res.ok) {
        setItems((prev) => [...prev, ...(res.posts as PostCardData[])]);
        setCursor(res.nextCursor ?? null);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/feed?filter=${t.key}`}
            className="rounded px-3 py-1"
            style={{
              border: "1px solid var(--kb-border)",
              borderRadius: "var(--kb-radius)",
              backgroundColor: filter === t.key ? "var(--kb-bg-hover, #eef2ff)" : "transparent",
              color: filter === t.key ? "var(--kb-text-primary)" : "var(--kb-text-secondary)",
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>Nothing here yet.</p>
      ) : (
        items.map((p) => <PostCard key={p.id} post={p} currentUserId={currentUserId} canPin={canPin} />)
      )}

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="mx-auto block rounded px-4 py-2 text-sm"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", color: "var(--kb-text-secondary)" }}
        >
          {pending ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

export function PinnedList({ posts, currentUserId, canPin }: { posts: PostCardData[]; currentUserId: string | null; canPin: boolean }) {
  if (posts.length === 0) {
    return <p className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No pinned announcements.</p>;
  }
  return (
    <div>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} currentUserId={currentUserId} canPin={canPin} />
      ))}
    </div>
  );
}

function CommentComposer({ postId, parentCommentId }: { postId: string; parentCommentId?: string | null }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!body.trim()) return;
    start(async () => {
      await api(`/api/feed/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), parentCommentId: parentCommentId ?? null }),
      });
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex gap-2">
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        className="flex-1 p-2 text-sm"
        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", backgroundColor: "var(--kb-bg)", color: "var(--kb-text-primary)" }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded px-3 py-2 text-sm font-medium"
        style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff", opacity: pending ? 0.6 : 1 }}
      >
        Reply
      </button>
    </div>
  );
}

function CommentRow({ comment, currentUserId }: { comment: CommentData; currentUserId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [replying, setReplying] = useState(false);
  const isAuthor = currentUserId === comment.authorId;

  function remove() {
    if (!confirm("Delete this comment?")) return;
    start(async () => {
      await api(`/api/feed/comments/${comment.id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <div className="mt-3" style={{ marginLeft: comment.parentCommentId ? 24 : 0 }}>
      <div className="flex items-start justify-between">
        <AuthorLine authorId={comment.authorId} createdAt={comment.createdAt} type="POST" pinned={false} />
        {isAuthor && (
          <button type="button" disabled={pending} onClick={remove} className="text-xs underline" style={{ color: "var(--kb-text-secondary)" }}>
            Delete
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-primary)" }}>{comment.body}</p>
      <div className="flex items-center gap-3">
        <ReactionBar target={{ commentId: comment.id }} groups={comment.reactionGroups} currentUserId={currentUserId} />
        {!comment.parentCommentId && (
          <button type="button" onClick={() => setReplying((v) => !v)} className="text-xs underline" style={{ color: "var(--kb-text-secondary)" }}>
            Reply
          </button>
        )}
      </div>
      {replying && <CommentComposer postId={comment.postId} parentCommentId={comment.id} />}
    </div>
  );
}

export function PostDetail({
  post,
  comments,
  currentUserId,
  canPin,
}: {
  post: PostCardData;
  comments: CommentData[];
  currentUserId: string | null;
  canPin: boolean;
}) {
  // Order comments so replies follow their parent.
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, CommentData[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const arr = repliesByParent.get(c.parentCommentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentCommentId, arr);
    }
  }
  const ordered: CommentData[] = [];
  for (const t of topLevel) {
    ordered.push(t);
    for (const r of repliesByParent.get(t.id) ?? []) ordered.push(r);
  }

  return (
    <div>
      <Link href="/app/feed" className="mb-3 inline-block text-sm underline" style={{ color: "var(--kb-text-secondary)" }}>
        Back to feed
      </Link>
      <PostCard post={post} currentUserId={currentUserId} canPin={canPin} />
      <section className="p-4" style={card}>
        <h4 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          Comments ({post.commentCount})
        </h4>
        <CommentComposer postId={post.id} />
        {ordered.map((c) => (
          <CommentRow key={c.id} comment={c} currentUserId={currentUserId} />
        ))}
      </section>
    </div>
  );
}
