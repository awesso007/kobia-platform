/*
 * Chat write helpers (Sprint 16). Every function takes an explicit db so it
 * works inside a request scope (getTenantDb) and outside one (seed script).
 *
 * sendMessage is the hot path: it inserts the message, parses @mentions against
 * known memberships, writes a MENTION Notification per mentioned user, reindexes
 * the message for the command palette, and dispatches a CHAT_MENTION automation
 * event per mention (best-effort, never breaks the send).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { reindex, removeFromIndex } from "@/lib/search";
import { notifyOn } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { channelSlug, dmSlug, parseMentions } from "./chat-utils";

type Db = PrismaClient;

/** Create a PUBLIC or PRIVATE channel and add the creator as an ADMIN member. */
export async function createChannel(
  db: Db,
  input: { name: string; description?: string | null; kind?: "PUBLIC" | "PRIVATE"; createdById: string | null },
): Promise<string> {
  const kind = input.kind ?? "PUBLIC";
  let slug = channelSlug(input.name);
  // Ensure slug uniqueness with a short numeric suffix on collision.
  const existing = await db.chatChannel.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const channel = await db.chatChannel.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      kind,
      createdById: input.createdById,
    },
  });

  if (input.createdById) {
    await db.chatMember.create({
      data: { channelId: channel.id, userId: input.createdById, role: "ADMIN" },
    });
  }
  return channel.id;
}

/** Find-or-create a 1:1 DM channel between two users. Idempotent on the pair. */
export async function findOrCreateDm(db: Db, userIdA: string, userIdB: string): Promise<string> {
  const slug = dmSlug(userIdA, userIdB);
  const existing = await db.chatChannel.findUnique({ where: { slug } });
  if (existing) return existing.id;

  const channel = await db.chatChannel.create({
    data: { name: "Direct message", slug, kind: "DM", createdById: userIdA },
  });
  await db.chatMember.createMany({
    data: [
      { channelId: channel.id, userId: userIdA, role: "MEMBER" },
      { channelId: channel.id, userId: userIdB, role: "MEMBER" },
    ],
  });
  return channel.id;
}

/**
 * Send a message into a channel. Resolves @mentions to memberships, stores the
 * resolved clerk user ids in mentionsJson, notifies each mentioned user, and
 * dispatches a CHAT_MENTION automation event per mention. Reindexes the message.
 */
export async function sendMessage(
  db: Db,
  input: {
    channelId: string;
    authorId: string;
    authorName: string;
    bodyText: string;
    parentId?: string | null;
    attachments?: unknown;
  },
): Promise<string> {
  const tokens = parseMentions(input.bodyText);
  let mentionedUserIds: string[] = [];
  if (tokens.length > 0) {
    // A token may be a clerk user id directly, or match an email local-part /
    // display name slug. We resolve the simplest case (token === clerkUserId).
    const members = await db.membership.findMany({
      where: { clerkUserId: { in: tokens } },
      select: { clerkUserId: true },
    });
    mentionedUserIds = members.map((m) => m.clerkUserId);
  }

  const message = await db.chatMessage.create({
    data: {
      channelId: input.channelId,
      parentId: input.parentId ?? null,
      authorId: input.authorId,
      authorName: input.authorName,
      bodyText: input.bodyText,
      attachments: (input.attachments ?? null) as never,
      mentionsJson: (mentionedUserIds.length ? mentionedUserIds : null) as never,
    },
  });

  await reindex(db, "CHAT_MESSAGE", message.id);

  const channel = await db.chatChannel.findUnique({ where: { id: input.channelId }, select: { name: true } });
  const linkUrl = `/app/chat/${input.channelId}`;
  for (const uid of mentionedUserIds) {
    if (uid === input.authorId) continue;
    await notifyOn(db, uid, {
      type: "MENTION",
      title: `${input.authorName} mentioned you in #${channel?.name ?? "chat"}`,
      body: input.bodyText.slice(0, 140),
      linkUrl,
    });
    await dispatchAutomation(
      {
        type: "CHAT_MENTION",
        entityType: "CHAT_MESSAGE",
        entityId: message.id,
        payload: { userId: uid },
      },
      db,
    );
  }

  return message.id;
}

/** Toggle a reaction (text label, no emoji char) on a message for a user. */
export async function toggleReaction(
  db: Db,
  input: { messageId: string; userId: string; emoji: string },
): Promise<{ added: boolean }> {
  const existing = await db.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: input.messageId, userId: input.userId, emoji: input.emoji } },
  });
  if (existing) {
    await db.chatReaction.delete({ where: { id: existing.id } });
    return { added: false };
  }
  await db.chatReaction.create({
    data: { messageId: input.messageId, userId: input.userId, emoji: input.emoji },
  });
  return { added: true };
}

/** Pin or unpin a message in its channel. Idempotent per (channel,message). */
export async function togglePin(
  db: Db,
  input: { channelId: string; messageId: string; pinnedById: string | null },
): Promise<{ pinned: boolean }> {
  const existing = await db.chatPinnedMessage.findUnique({
    where: { channelId_messageId: { channelId: input.channelId, messageId: input.messageId } },
  });
  if (existing) {
    await db.chatPinnedMessage.delete({ where: { id: existing.id } });
    return { pinned: false };
  }
  await db.chatPinnedMessage.create({
    data: { channelId: input.channelId, messageId: input.messageId, pinnedById: input.pinnedById },
  });
  return { pinned: true };
}

/** Mark a channel read up to a message (or now), bumping the member lastReadAt. */
export async function markRead(
  db: Db,
  input: { channelId: string; userId: string; upToMessageId?: string | null },
): Promise<void> {
  let readAt = new Date();
  if (input.upToMessageId) {
    const msg = await db.chatMessage.findUnique({ where: { id: input.upToMessageId }, select: { createdAt: true } });
    if (msg) readAt = msg.createdAt;
  }
  await db.chatMember.updateMany({
    where: { channelId: input.channelId, userId: input.userId },
    data: { lastReadAt: readAt },
  });
}

/** Edit a message body (author only enforced by caller). Reindexes. */
export async function editMessage(db: Db, messageId: string, bodyText: string): Promise<void> {
  await db.chatMessage.update({
    where: { id: messageId },
    data: { bodyText, editedAt: new Date() },
  });
  await reindex(db, "CHAT_MESSAGE", messageId);
}

/** Soft-delete a message and remove it from the search index. */
export async function deleteMessage(db: Db, messageId: string): Promise<void> {
  await db.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date(), bodyText: "" } });
  await removeFromIndex(db, "CHAT_MESSAGE", messageId);
}

/** Ensure a user is a member of a channel (used when joining a PUBLIC channel). */
export async function ensureMember(db: Db, channelId: string, userId: string): Promise<void> {
  await db.chatMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, role: "MEMBER" },
    update: {},
  });
}
