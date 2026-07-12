/*
 * Feed read helpers (Sprint 21). Every function takes an explicit db so it works
 * inside a request scope (getTenantDb) and outside one (seed / cron). Soft-deleted
 * posts and comments (deletedAt set) are excluded everywhere.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, Prisma } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

export type FeedFilter = "all" | "announcements" | "mentions" | "mine";

const PAGE_SIZE = 20;

export type PostReactionGroup = { kind: string; userIds: string[] };

/** Group a post's reactions by kind into {kind, userIds}. */
function groupReactions(reactions: { kind: string; userId: string }[]): PostReactionGroup[] {
  const byKind = new Map<string, string[]>();
  for (const r of reactions) {
    const arr = byKind.get(r.kind) ?? [];
    arr.push(r.userId);
    byKind.set(r.kind, arr);
  }
  return Array.from(byKind.entries()).map(([kind, userIds]) => ({ kind, userIds }));
}

/**
 * List feed posts newest-first with cursor pagination. Returns the page plus a
 * nextCursor (post id) when more rows exist. filter narrows the stream:
 *   all           - every visible post
 *   announcements - type = ANNOUNCEMENT
 *   mentions      - posts where currentUserId is mentioned
 *   mine          - posts authored by currentUserId
 */
export async function listPosts(
  db: Db,
  opts: { filter?: FeedFilter; cursor?: string | null; limit?: number; currentUserId?: string | null } = {},
): Promise<{ posts: Awaited<ReturnType<typeof loadPostCards>>; nextCursor: string | null }> {
  const filter = opts.filter ?? "all";
  const take = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), 50);

  const where: Prisma.FeedPostWhereInput = { deletedAt: null };
  if (filter === "announcements") where.type = "ANNOUNCEMENT";
  if (filter === "mine" && opts.currentUserId) where.authorId = opts.currentUserId;
  if (filter === "mentions" && opts.currentUserId) {
    where.mentions = { some: { mentionedUserId: opts.currentUserId } };
  }

  const rows = await db.feedPost.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;
  const posts = await loadPostCards(db, page);
  return { posts, nextCursor };
}

/** Enrich raw posts with reaction groups and a poll summary for list rendering. */
async function loadPostCards(db: Db, posts: { id: string }[]) {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  const [full, reactions, polls] = await Promise.all([
    db.feedPost.findMany({ where: { id: { in: ids } } }),
    db.feedReaction.findMany({ where: { postId: { in: ids } }, select: { postId: true, kind: true, userId: true } }),
    db.feedPoll.findMany({ where: { postId: { in: ids } }, include: { options: { orderBy: { order: "asc" } } } }),
  ]);
  const byId = new Map(full.map((p) => [p.id, p]));
  const reactionsByPost = new Map<string, { kind: string; userId: string }[]>();
  for (const r of reactions) {
    if (!r.postId) continue;
    const arr = reactionsByPost.get(r.postId) ?? [];
    arr.push({ kind: r.kind, userId: r.userId });
    reactionsByPost.set(r.postId, arr);
  }
  const pollByPost = new Map(polls.map((p) => [p.postId, p]));

  return posts
    .map((p) => byId.get(p.id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      ...p,
      reactionGroups: groupReactions(reactionsByPost.get(p.id) ?? []),
      poll: pollByPost.get(p.id) ?? null,
    }));
}

/** Fetch a single post with reactions, threaded comments, poll, and vote tallies. */
export async function getPost(db: Db, id: string) {
  const post = await db.feedPost.findFirst({ where: { id, deletedAt: null } });
  if (!post) return null;

  const [reactions, comments, commentReactions, poll] = await Promise.all([
    db.feedReaction.findMany({ where: { postId: id }, select: { kind: true, userId: true } }),
    db.feedComment.findMany({ where: { postId: id, deletedAt: null }, orderBy: { createdAt: "asc" } }),
    db.feedReaction.findMany({
      where: { comment: { postId: id } },
      select: { commentId: true, kind: true, userId: true },
    }),
    db.feedPoll.findUnique({ where: { postId: id }, include: { options: { orderBy: { order: "asc" } } } }),
  ]);

  const crByComment = new Map<string, { kind: string; userId: string }[]>();
  for (const r of commentReactions) {
    if (!r.commentId) continue;
    const arr = crByComment.get(r.commentId) ?? [];
    arr.push({ kind: r.kind, userId: r.userId });
    crByComment.set(r.commentId, arr);
  }

  let pollWithCounts: (typeof poll & { voteCounts: number[] }) | null = null;
  if (poll) {
    const votes = await db.feedPollVote.groupBy({
      by: ["optionId"],
      where: { pollId: poll.id },
      _count: { _all: true },
    });
    const countByOption = new Map(votes.map((v) => [v.optionId, v._count._all]));
    pollWithCounts = {
      ...poll,
      voteCounts: poll.options.map((o) => countByOption.get(o.id) ?? 0),
    };
  }

  return {
    ...post,
    reactionGroups: groupReactions(reactions),
    poll: pollWithCounts,
    comments: comments.map((c) => ({
      ...c,
      reactionGroups: groupReactions(crByComment.get(c.id) ?? []),
    })),
  };
}

/** Posts and comments where the given user is mentioned, most recent first. */
export async function listMentions(db: Db, userId: string, limit = 30) {
  const mentions = await db.feedMention.findMany({
    where: { mentionedUserId: userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });

  const postIds = Array.from(new Set(mentions.map((m) => m.postId).filter((x): x is string => Boolean(x))));
  const commentIds = Array.from(new Set(mentions.map((m) => m.commentId).filter((x): x is string => Boolean(x))));
  const [posts, comments] = await Promise.all([
    postIds.length
      ? db.feedPost.findMany({ where: { id: { in: postIds }, deletedAt: null } })
      : Promise.resolve([]),
    commentIds.length
      ? db.feedComment.findMany({ where: { id: { in: commentIds }, deletedAt: null } })
      : Promise.resolve([]),
  ]);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const commentById = new Map(comments.map((c) => [c.id, c]));

  return mentions
    .map((m) => {
      if (m.postId && postById.has(m.postId)) {
        const p = postById.get(m.postId)!;
        return { mention: m, kind: "POST" as const, postId: p.id, title: p.title ?? p.body.slice(0, 80), createdAt: m.createdAt };
      }
      if (m.commentId && commentById.has(m.commentId)) {
        const c = commentById.get(m.commentId)!;
        return { mention: m, kind: "COMMENT" as const, postId: c.postId, title: c.body.slice(0, 80), createdAt: m.createdAt };
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

/** Pinned posts (announcements board), newest first. */
export async function listPinned(db: Db) {
  const page = await db.feedPost.findMany({
    where: { deletedAt: null, pinned: true },
    orderBy: { createdAt: "desc" },
  });
  return loadPostCards(db, page);
}
