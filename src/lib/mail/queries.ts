/*
 * queries.ts (Sprint 23) - read helpers for the Webmail UI. Everything is
 * scoped to an EmailAccount; the API layer resolves the current user and passes
 * ownership through getOwnedAccount so a user can only ever read their own mail.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, EmailFolder } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

const PAGE_SIZE = 30;
const MESSAGE_ORDER = [{ receivedAt: "desc" as const }, { sentAt: "desc" as const }, { createdAt: "desc" as const }];

const MESSAGE_SELECT = {
  id: true,
  threadId: true,
  accountId: true,
  direction: true,
  fromAddress: true,
  toAddresses: true,
  ccAddresses: true,
  subject: true,
  snippet: true,
  bodyHtml: true,
  bodyText: true,
  folder: true,
  isRead: true,
  isStarred: true,
  sentAt: true,
  receivedAt: true,
  createdAt: true,
  labels: { select: { labelId: true, label: { select: { id: true, name: true, color: true } } } },
} as const;

/** Resolve an account the given user owns, or null. */
export async function getOwnedAccount(db: Db, accountId: string, userId: string | null) {
  const account = await db.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;
  if (userId && account.ownerClerkUserId !== userId) return null;
  return account;
}

/** All connected accounts for a user (newest first). */
export async function listAccounts(db: Db, userId: string | null) {
  return db.emailAccount.findMany({
    where: userId ? { ownerClerkUserId: userId } : {},
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      address: true,
      displayName: true,
      provider: true,
      status: true,
      lastSyncedAt: true,
    },
  });
}

export type ListMessagesArgs = {
  accountId: string;
  folder?: EmailFolder | null;
  labelId?: string | null;
  threadId?: string | null;
  q?: string | null;
  cursor?: string | null;
  limit?: number;
};

/** Cursor-paginated message list for a folder / label / thread / search. */
export async function listMessages(db: Db, args: ListMessagesArgs) {
  const take = Math.min(args.limit ?? PAGE_SIZE, 100);
  const where: Record<string, unknown> = { accountId: args.accountId };
  if (args.folder) where.folder = args.folder;
  if (args.threadId) where.threadId = args.threadId;
  if (args.labelId) where.labels = { some: { labelId: args.labelId } };
  if (args.q && args.q.trim()) {
    const q = args.q.trim();
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { fromAddress: { contains: q, mode: "insensitive" } },
      { bodyText: { contains: q, mode: "insensitive" } },
      { snippet: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await db.emailMessage.findMany({
    where,
    orderBy: MESSAGE_ORDER,
    take: take + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    select: MESSAGE_SELECT,
  });

  const hasMore = rows.length > take;
  const messages = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? messages[messages.length - 1]?.id ?? null : null;
  return { messages, nextCursor };
}

/** All messages in a thread, oldest first. */
export async function getThread(db: Db, accountId: string, threadId: string) {
  const thread = await db.emailThread.findFirst({ where: { id: threadId, accountId } });
  if (!thread) return null;
  const messages = await db.emailMessage.findMany({
    where: { accountId, threadId },
    orderBy: [{ receivedAt: "asc" }, { sentAt: "asc" }, { createdAt: "asc" }],
    select: { ...MESSAGE_SELECT, attachments: { select: { id: true, filename: true, mimeType: true, size: true } } },
  });
  return { thread, messages };
}

export async function searchMessages(db: Db, accountId: string, q: string, cursor?: string | null) {
  return listMessages(db, { accountId, q, cursor });
}

export async function listLabels(db: Db, accountId: string) {
  return db.emailLabel.findMany({ where: { accountId }, orderBy: { name: "asc" } });
}

export async function listFilters(db: Db, accountId: string) {
  return db.emailFilter.findMany({ where: { accountId }, orderBy: { createdAt: "asc" } });
}

export async function listDrafts(db: Db, accountId: string) {
  return db.emailDraft.findMany({ where: { accountId }, orderBy: { updatedAt: "desc" } });
}

export async function getDraft(db: Db, accountId: string, id: string) {
  return db.emailDraft.findFirst({ where: { id, accountId } });
}

export async function listSignatures(db: Db, accountId: string, userId: string | null) {
  return db.emailSignature.findMany({
    where: { OR: [{ accountId }, ...(userId ? [{ ownerClerkUserId: userId, accountId: null }] : [])] },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/** Unread message count per folder for the left rail badges. */
export async function folderCounts(db: Db, accountId: string): Promise<Record<string, number>> {
  const grouped = await db.emailMessage.groupBy({
    by: ["folder"],
    where: { accountId, isRead: false },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.folder] = g._count._all;
  return out;
}
