/*
 * Chat page server queries (Sprint 16, server-only). Thin wrappers over the
 * shared chat lib that resolve the active tenant via getTenantDb() and the
 * current member via getCurrentMembership(). Used by the chat server pages to
 * provide initial data for the client shell.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import { listChannels, getChannel, listMessages, listPinned } from "@/lib/chat/queries";

/** The current user's clerk id, or a stable empty string for the alpha fallback. */
export async function currentUserId(): Promise<string> {
  const member = await getCurrentMembership();
  return member?.clerkUserId ?? "";
}

/** Active tenant members for @mention autocomplete + DM creation. */
export async function listMembers() {
  const { db } = getTenantDb();
  const rows = await db.membership.findMany({
    where: { status: "ACTIVE" },
    orderBy: { displayName: "asc" },
    select: { clerkUserId: true, displayName: true, email: true },
  });
  return rows.map((r) => ({
    userId: r.clerkUserId,
    name: r.displayName ?? r.email ?? r.clerkUserId,
    email: r.email,
  }));
}

export async function channelsForCurrentUser() {
  const { db } = getTenantDb();
  const userId = await currentUserId();
  return listChannels(db, userId);
}

export async function channelDetail(channelId: string) {
  const { db } = getTenantDb();
  const channel = await getChannel(db, channelId);
  if (!channel) return null;
  const [page, pinned] = await Promise.all([
    listMessages(db, channelId),
    listPinned(db, channelId),
  ]);
  return { channel, messages: page.messages, nextCursor: page.nextCursor, pinned };
}
