/*
 * Server-only page data loaders for the Feed module (Sprint 21). These wrap the
 * request-scoped tenant db + current membership and shape the results into
 * plain objects the client components render. Server pages call these; the
 * client components then talk to /api/feed/** for interactions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import { listPosts, getPost, listPinned, listMentions, type FeedFilter } from "@/lib/feed/queries";
import { recordView } from "@/lib/feed/mutations";

function canPinFor(role: string | undefined): boolean {
  return role === "ADMIN" || role === "OWNER";
}

export async function loadFeedPage(filter: FeedFilter) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const currentUserId = member?.clerkUserId ?? null;
  const [{ posts, nextCursor }, members] = await Promise.all([
    listPosts(db, { filter, currentUserId }),
    db.membership.findMany({
      where: { status: "ACTIVE" },
      select: { clerkUserId: true, displayName: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { posts, nextCursor, currentUserId, filter, members, canPin: canPinFor(member?.role) };
}

export async function loadPinnedPage() {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const posts = await listPinned(db);
  return { posts, currentUserId: member?.clerkUserId ?? null, canPin: canPinFor(member?.role) };
}

export async function loadPostDetail(id: string) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const [post, members] = await Promise.all([
    getPost(db, id),
    db.membership.findMany({
      where: { status: "ACTIVE" },
      select: { clerkUserId: true, displayName: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (post && member?.clerkUserId) {
    await recordView(db, post.id, member.clerkUserId);
  }
  return { post, currentUserId: member?.clerkUserId ?? null, members, canPin: canPinFor(member?.role) };
}

export async function loadMentions() {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  if (!member) return { mentions: [] };
  const mentions = await listMentions(db, member.clerkUserId);
  return { mentions };
}
