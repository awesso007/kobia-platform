/*
 * Feed write helpers (Sprint 21). Every function takes an explicit db so it
 * works inside a request scope (getTenantDb) and outside one (seed / cron).
 *
 * createPost / createComment parse @mentions against known memberships, write a
 * FeedMention row per resolved user, notify each mentioned user, and dispatch
 * the matching automation events (best-effort, never breaks the write).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { notifyOn } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { parseMentions, type ReactionKind } from "./feed-utils";

type Db = PrismaClient;

type PostType = "POST" | "ANNOUNCEMENT" | "POLL" | "QUESTION" | "EVENT_SHARE" | "RECORD_SHARE" | "SYSTEM";
type Visibility = "PUBLIC" | "PRIVATE_GROUP" | "DIRECT";
type SharedRecordType = "DEAL" | "CONTACT" | "TASK" | "DOCUMENT";

/** Resolve raw @tokens to known clerk user ids (token === clerkUserId). */
async function resolveMentions(db: Db, body: string): Promise<string[]> {
  const tokens = parseMentions(body);
  if (tokens.length === 0) return [];
  const members = await db.membership.findMany({
    where: { clerkUserId: { in: tokens } },
    select: { clerkUserId: true },
  });
  return members.map((m) => m.clerkUserId);
}

export type CreatePostInput = {
  authorId: string;
  authorName?: string | null;
  type?: PostType;
  title?: string | null;
  body: string;
  attachments?: unknown;
  visibility?: Visibility;
  sharedRecordType?: SharedRecordType | null;
  sharedRecordId?: string | null;
  sharedRecordSnapshot?: unknown;
  pinned?: boolean;
  poll?: { question: string; options: string[]; allowMultiple?: boolean; closesAt?: Date | string | null } | null;
};

/**
 * Create a feed post (optionally with a poll), resolve mentions, and dispatch
 * FEED_POST_CREATED + a per-mention FEED_MENTION. Returns the new post id.
 */
export async function createPost(db: Db, input: CreatePostInput): Promise<string> {
  const type: PostType = input.poll ? "POLL" : (input.type ?? "POST");
  const mentionedUserIds = await resolveMentions(db, input.body);

  const post = await db.feedPost.create({
    data: {
      authorId: input.authorId,
      type,
      title: input.title?.trim() || null,
      body: input.body,
      attachments: (input.attachments ?? null) as never,
      visibility: input.visibility ?? "PUBLIC",
      sharedRecordType: input.sharedRecordType ?? null,
      sharedRecordId: input.sharedRecordId ?? null,
      sharedRecordSnapshot: (input.sharedRecordSnapshot ?? null) as never,
      pinned: input.pinned ?? false,
    },
  });

  if (input.poll && input.poll.options.filter((o) => o.trim()).length >= 2) {
    const options = input.poll.options.map((o) => o.trim()).filter(Boolean);
    const poll = await db.feedPoll.create({
      data: {
        postId: post.id,
        question: input.poll.question.trim(),
        allowMultiple: input.poll.allowMultiple ?? false,
        closesAt: input.poll.closesAt ? new Date(input.poll.closesAt) : null,
      },
    });
    await db.feedPollOption.createMany({
      data: options.map((label, idx) => ({ pollId: poll.id, label, order: idx })),
    });
  }

  for (const uid of mentionedUserIds) {
    await db.feedMention.create({ data: { postId: post.id, mentionedUserId: uid } });
  }

  const record = { authorId: post.authorId, type: post.type, title: post.title ?? "", body: post.body, visibility: post.visibility, pinned: post.pinned };
  await dispatchAutomation({ type: "FEED_POST_CREATED", entityType: "FEED_POST", entityId: post.id, record }, db);

  const linkUrl = `/app/feed/posts/${post.id}`;
  for (const uid of mentionedUserIds) {
    if (uid === input.authorId) continue;
    await notifyOn(db, uid, {
      type: "MENTION",
      title: `${input.authorName?.trim() || "Someone"} mentioned you in a post`,
      body: input.body.slice(0, 140),
      linkUrl,
    });
    await dispatchAutomation(
      { type: "FEED_MENTION", entityType: "FEED_POST", entityId: post.id, payload: { userId: uid } },
      db,
    );
  }

  return post.id;
}

export type CreateCommentInput = {
  postId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  parentCommentId?: string | null;
  attachments?: unknown;
};

/**
 * Add a comment (one-level threading), bump the post commentCount, resolve
 * mentions, notify the post author + each mentioned user, and dispatch
 * FEED_COMMENT_CREATED + per-mention FEED_MENTION. Returns the comment id.
 */
export async function createComment(db: Db, input: CreateCommentInput): Promise<string> {
  const post = await db.feedPost.findFirst({ where: { id: input.postId, deletedAt: null }, select: { id: true, authorId: true } });
  if (!post) throw new Error("Post not found");

  // One-level threading: a reply to a reply attaches to the top-level comment.
  let parentCommentId = input.parentCommentId ?? null;
  if (parentCommentId) {
    const parent = await db.feedComment.findUnique({ where: { id: parentCommentId }, select: { parentCommentId: true } });
    if (parent?.parentCommentId) parentCommentId = parent.parentCommentId;
  }

  const mentionedUserIds = await resolveMentions(db, input.body);

  const comment = await db.feedComment.create({
    data: {
      postId: input.postId,
      parentCommentId,
      authorId: input.authorId,
      body: input.body,
      attachments: (input.attachments ?? null) as never,
    },
  });
  await db.feedPost.update({ where: { id: input.postId }, data: { commentCount: { increment: 1 } } });

  for (const uid of mentionedUserIds) {
    await db.feedMention.create({ data: { commentId: comment.id, mentionedUserId: uid } });
  }

  const record = { postId: comment.postId, authorId: comment.authorId, body: comment.body };
  await dispatchAutomation({ type: "FEED_COMMENT_CREATED", entityType: "FEED_COMMENT", entityId: comment.id, record }, db);

  const linkUrl = `/app/feed/posts/${input.postId}`;
  const notified = new Set<string>();

  if (post.authorId !== input.authorId) {
    notified.add(post.authorId);
    await notifyOn(db, post.authorId, {
      type: "SYSTEM",
      title: `${input.authorName?.trim() || "Someone"} commented on your post`,
      body: input.body.slice(0, 140),
      linkUrl,
    });
  }

  for (const uid of mentionedUserIds) {
    if (uid === input.authorId || notified.has(uid)) continue;
    notified.add(uid);
    await notifyOn(db, uid, {
      type: "MENTION",
      title: `${input.authorName?.trim() || "Someone"} mentioned you in a comment`,
      body: input.body.slice(0, 140),
      linkUrl,
    });
    await dispatchAutomation(
      { type: "FEED_MENTION", entityType: "FEED_COMMENT", entityId: comment.id, payload: { userId: uid } },
      db,
    );
  }

  return comment.id;
}

/**
 * Toggle a reaction for a user on exactly one of a post or comment. Uses
 * findFirst (partial unique index cannot be a composite findUnique) and keeps
 * the denormalized reactionCount in sync. Returns whether it was added.
 */
export async function toggleReaction(
  db: Db,
  input: { postId?: string | null; commentId?: string | null; userId: string; kind: ReactionKind },
): Promise<{ added: boolean }> {
  const onPost = Boolean(input.postId);
  const onComment = Boolean(input.commentId);
  if (onPost === onComment) throw new Error("Provide exactly one of postId or commentId");

  const existing = await db.feedReaction.findFirst({
    where: {
      userId: input.userId,
      kind: input.kind,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
    },
  });

  if (existing) {
    await db.feedReaction.delete({ where: { id: existing.id } });
    if (onPost) await db.feedPost.update({ where: { id: input.postId! }, data: { reactionCount: { decrement: 1 } } });
    else await db.feedComment.update({ where: { id: input.commentId! }, data: { reactionCount: { decrement: 1 } } });
    return { added: false };
  }

  await db.feedReaction.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
    },
  });
  if (onPost) await db.feedPost.update({ where: { id: input.postId! }, data: { reactionCount: { increment: 1 } } });
  else await db.feedComment.update({ where: { id: input.commentId! }, data: { reactionCount: { increment: 1 } } });
  return { added: true };
}

/** Remove a user's reaction of a specific kind from a post or comment (no-op if absent). */
export async function removeReaction(
  db: Db,
  input: { postId?: string | null; commentId?: string | null; userId: string; kind: ReactionKind },
): Promise<{ removed: boolean }> {
  const onPost = Boolean(input.postId);
  const onComment = Boolean(input.commentId);
  if (onPost === onComment) throw new Error("Provide exactly one of postId or commentId");
  const existing = await db.feedReaction.findFirst({
    where: {
      userId: input.userId,
      kind: input.kind,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
    },
  });
  if (!existing) return { removed: false };
  await db.feedReaction.delete({ where: { id: existing.id } });
  if (onPost) await db.feedPost.update({ where: { id: input.postId! }, data: { reactionCount: { decrement: 1 } } });
  else await db.feedComment.update({ where: { id: input.commentId! }, data: { reactionCount: { decrement: 1 } } });
  return { removed: true };
}

/**
 * Cast poll votes for a user. Enforces single-choice unless allowMultiple, and
 * replaces the user's prior votes on the poll. Ignores votes on a closed poll.
 */
export async function votePoll(
  db: Db,
  input: { pollId: string; userId: string; optionIds: string[] },
): Promise<void> {
  const poll = await db.feedPoll.findUnique({ where: { id: input.pollId }, include: { options: true } });
  if (!poll) throw new Error("Poll not found");
  if (poll.closedAt) throw new Error("Poll is closed");

  const validIds = new Set(poll.options.map((o) => o.id));
  let optionIds = input.optionIds.filter((id) => validIds.has(id));
  if (optionIds.length === 0) return;
  if (!poll.allowMultiple) optionIds = [optionIds[0]!];

  await db.feedPollVote.deleteMany({ where: { pollId: poll.id, userId: input.userId } });
  await db.feedPollVote.createMany({
    data: optionIds.map((optionId) => ({ pollId: poll.id, optionId, userId: input.userId })),
  });
}

/** Toggle pinned on a post and dispatch FEED_ANNOUNCEMENT_PINNED when pinning. */
export async function togglePin(db: Db, postId: string): Promise<{ pinned: boolean }> {
  const post = await db.feedPost.findFirst({ where: { id: postId, deletedAt: null }, select: { pinned: true } });
  if (!post) throw new Error("Post not found");
  const pinned = !post.pinned;
  await db.feedPost.update({ where: { id: postId }, data: { pinned } });
  if (pinned) {
    await dispatchAutomation(
      { type: "FEED_ANNOUNCEMENT_PINNED", entityType: "FEED_POST", entityId: postId },
      db,
    );
  }
  return { pinned };
}

/** Register a view for a user at most once, incrementing viewCount on first view. */
export async function recordView(db: Db, postId: string, userId: string): Promise<void> {
  const existing = await db.feedView.findUnique({ where: { postId_userId: { postId, userId } } });
  if (existing) return;
  try {
    await db.feedView.create({ data: { postId, userId } });
    await db.feedPost.update({ where: { id: postId }, data: { viewCount: { increment: 1 } } });
  } catch {
    // Concurrent first view; unique constraint already recorded it.
  }
}

/** Edit a post body/title (author or admin enforced by the caller). */
export async function editPost(
  db: Db,
  postId: string,
  input: { title?: string | null; body?: string },
): Promise<void> {
  await db.feedPost.update({
    where: { id: postId },
    data: {
      ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
    },
  });
}

/** Soft-delete a post and cascade a soft-delete to its comments. */
export async function deletePost(db: Db, postId: string): Promise<void> {
  const now = new Date();
  await db.feedPost.update({ where: { id: postId }, data: { deletedAt: now } });
  await db.feedComment.updateMany({ where: { postId, deletedAt: null }, data: { deletedAt: now } });
}

/** Edit a comment body (author only + 15 min window enforced by the caller). */
export async function editComment(db: Db, commentId: string, body: string): Promise<void> {
  await db.feedComment.update({ where: { id: commentId }, data: { body } });
}

/** Soft-delete a comment and decrement the post commentCount. */
export async function deleteComment(db: Db, commentId: string): Promise<void> {
  const comment = await db.feedComment.findUnique({ where: { id: commentId }, select: { postId: true, deletedAt: true } });
  if (!comment || comment.deletedAt) return;
  await db.feedComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  await db.feedPost.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } });
}

/** Follow or unfollow a target (post/user/record). Idempotent per triple. */
export async function toggleFollow(
  db: Db,
  input: { userId: string; targetType: "POST" | "USER" | "RECORD"; targetId: string },
): Promise<{ following: boolean }> {
  const existing = await db.feedFollow.findUnique({
    where: { userId_targetType_targetId: { userId: input.userId, targetType: input.targetType, targetId: input.targetId } },
  });
  if (existing) {
    await db.feedFollow.delete({ where: { id: existing.id } });
    return { following: false };
  }
  await db.feedFollow.create({ data: { userId: input.userId, targetType: input.targetType, targetId: input.targetId } });
  return { following: true };
}
