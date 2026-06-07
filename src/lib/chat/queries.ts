/*
 * Chat read helpers (Sprint 16). Every function takes an explicit db so it works
 * inside a request scope (getTenantDb) and outside one (getTenantPrisma by slug,
 * used by the chat-digest and presence-cleanup crons and the seed script).
 *
 * Channel + DM listing resolves a per-user unread count from the member's
 * lastReadAt; message listing is cursor-paginated by createdAt (descending,
 * reversed to chronological for display).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { dmDisplayName } from "./chat-utils";

type Db = PrismaClient;

export type ChannelSummary = {
  id: string;
  name: string;
  slug: string;
  kind: "PUBLIC" | "PRIVATE" | "DM" | "GROUP_DM";
  description: string | null;
  isArchived: boolean;
  unreadCount: number;
  lastMessageAt: Date | null;
};

const MESSAGE_PAGE_SIZE = 30;

/** Count messages newer than the member's lastReadAt in one channel. */
async function unreadFor(db: Db, channelId: string, lastReadAt: Date | null, selfUserId: string): Promise<number> {
  return db.chatMessage.count({
    where: {
      channelId,
      parentId: null,
      deletedAt: null,
      authorId: { not: selfUserId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

/**
 * List the channels (and DMs) the user is a member of, plus all PUBLIC channels.
 * Each summary carries an unread count and the channel's most recent message
 * timestamp so the sidebar can sort + badge. DMs get the other member's name.
 */
export async function listChannels(db: Db, userId: string): Promise<ChannelSummary[]> {
  const memberships = await db.chatMember.findMany({
    where: { userId },
    select: { channelId: true, lastReadAt: true },
  });
  const memberOf = new Map(memberships.map((m) => [m.channelId, m.lastReadAt]));

  const channels = await db.chatChannel.findMany({
    where: {
      isArchived: false,
      OR: [{ kind: "PUBLIC" }, { id: { in: Array.from(memberOf.keys()) } }],
    },
    orderBy: { createdAt: "asc" },
  });

  const out: ChannelSummary[] = [];
  for (const c of channels) {
    const last = await db.chatMessage.findFirst({
      where: { channelId: c.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const lastReadAt = memberOf.get(c.id) ?? null;
    const unreadCount = memberOf.has(c.id) ? await unreadFor(db, c.id, lastReadAt, userId) : 0;

    let name = c.name;
    if (c.kind === "DM") {
      const others = await db.chatMember.findMany({ where: { channelId: c.id, userId: { not: userId } } });
      const otherId = others[0]?.userId ?? null;
      if (otherId) {
        const m = await db.membership.findUnique({ where: { clerkUserId: otherId } });
        name = dmDisplayName(m?.displayName ?? null, m?.email ?? null);
      }
    }

    out.push({
      id: c.id,
      name,
      slug: c.slug,
      kind: c.kind as ChannelSummary["kind"],
      description: c.description,
      isArchived: c.isArchived,
      unreadCount,
      lastMessageAt: last?.createdAt ?? null,
    });
  }
  return out;
}

/** Load one channel with its members (and resolved member display names). */
export async function getChannel(db: Db, channelId: string) {
  const channel = await db.chatChannel.findUnique({ where: { id: channelId } });
  if (!channel) return null;

  const members = await db.chatMember.findMany({ where: { channelId }, orderBy: { joinedAt: "asc" } });
  const ids = members.map((m) => m.userId);
  const people = ids.length
    ? await db.membership.findMany({ where: { clerkUserId: { in: ids } } })
    : [];
  const byId = new Map(people.map((p) => [p.clerkUserId, p]));

  return {
    ...channel,
    members: members.map((m) => {
      const p = byId.get(m.userId);
      return {
        ...m,
        displayName: p?.displayName ?? p?.email ?? m.userId,
        email: p?.email ?? null,
      };
    }),
  };
}

export type MessagePage = {
  messages: Array<{
    id: string;
    channelId: string;
    parentId: string | null;
    authorId: string;
    authorName: string;
    bodyText: string;
    bodyHtml: string | null;
    attachments: unknown;
    mentionsJson: unknown;
    editedAt: Date | null;
    createdAt: Date;
    reactions: Array<{ emoji: string; userId: string }>;
    replyCount: number;
  }>;
  nextCursor: string | null;
};

/**
 * Cursor-paginated top-level messages for a channel, newest first internally but
 * returned in chronological order. Pass the previous page's nextCursor (a
 * createdAt ISO string) to fetch older messages.
 */
export async function listMessages(
  db: Db,
  channelId: string,
  opts: { cursor?: string | null; parentId?: string | null } = {},
): Promise<MessagePage> {
  const parentId = opts.parentId ?? null;
  const rows = await db.chatMessage.findMany({
    where: {
      channelId,
      parentId,
      deletedAt: null,
      ...(opts.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MESSAGE_PAGE_SIZE + 1,
    include: {
      reactions: { select: { emoji: true, userId: true } },
      _count: { select: { replies: true } },
    },
  });

  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, MESSAGE_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;

  const messages = page
    .map((r) => ({
      id: r.id,
      channelId: r.channelId,
      parentId: r.parentId,
      authorId: r.authorId,
      authorName: r.authorName,
      bodyText: r.bodyText,
      bodyHtml: r.bodyHtml,
      attachments: r.attachments,
      mentionsJson: r.mentionsJson,
      editedAt: r.editedAt,
      createdAt: r.createdAt,
      reactions: r.reactions,
      replyCount: r._count.replies,
    }))
    .reverse();

  return { messages, nextCursor };
}

/** Pinned messages for a channel, most recently pinned first. */
export async function listPinned(db: Db, channelId: string) {
  const pins = await db.chatPinnedMessage.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    include: { message: true },
  });
  return pins.map((p) => ({
    pinId: p.id,
    messageId: p.messageId,
    authorName: p.message.authorName,
    bodyText: p.message.bodyText,
    createdAt: p.message.createdAt,
  }));
}

/** Per-channel unread counts for the user, keyed by channelId. */
export async function unreadCounts(db: Db, userId: string): Promise<Record<string, number>> {
  const memberships = await db.chatMember.findMany({
    where: { userId },
    select: { channelId: true, lastReadAt: true },
  });
  const out: Record<string, number> = {};
  for (const m of memberships) {
    out[m.channelId] = await unreadFor(db, m.channelId, m.lastReadAt, userId);
  }
  return out;
}
