/*
 * Server-only page data loaders for the Workgroups module (Sprint 22). They wrap
 * the request-scoped tenant db + current membership and shape results into plain
 * objects the client components render. Client components then talk to
 * /api/workgroups/** for interactions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import {
  listMyGroups,
  listDiscover,
  getGroupBySlug,
  listMembers,
  listPendingInvites,
  listJoinRequests,
  listGroupFeed,
  listGroupTasks,
  listGroupFiles,
  listGroupEvents,
} from "@/lib/workgroups/queries";

/** List page: my groups + discoverable groups for the current user. */
export async function loadWorkgroupsPage() {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const userId = member?.clerkUserId ?? null;
  const [mine, discover] = await Promise.all([
    userId ? listMyGroups(db, userId) : Promise.resolve([]),
    listDiscover(db, userId),
  ]);
  return { mine, discover, currentUserId: userId };
}

/** Directory of active members for the create form / invite pickers. */
export async function loadDirectory() {
  const { db } = getTenantDb();
  return db.membership.findMany({
    where: { status: "ACTIVE" },
    select: { clerkUserId: true, displayName: true, email: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Shared group context for the [slug] layout: group + caller role. */
export async function loadGroupShell(slug: string) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const userId = member?.clerkUserId ?? null;
  const group = await getGroupBySlug(db, slug, userId);
  return { group, currentUserId: userId };
}

export async function loadGroupFeed(slug: string) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const userId = member?.clerkUserId ?? null;
  const group = await getGroupBySlug(db, slug, userId);
  if (!group) return null;
  const [{ posts, nextCursor }, members] = await Promise.all([
    listGroupFeed(db, group.id, { currentUserId: userId }),
    db.membership.findMany({
      where: { status: "ACTIVE" },
      select: { clerkUserId: true, displayName: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { group, posts, nextCursor, currentUserId: userId, members };
}

export async function loadGroupTasks(slug: string) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const group = await getGroupBySlug(db, slug, member?.clerkUserId ?? null);
  if (!group) return null;
  const tasks = await listGroupTasks(db, group.id);
  return { group, tasks };
}

export async function loadGroupFiles(slug: string) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const group = await getGroupBySlug(db, slug, member?.clerkUserId ?? null);
  if (!group) return null;
  const files = await listGroupFiles(db, group.id);
  return { group, files };
}

export async function loadGroupEvents(slug: string) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const group = await getGroupBySlug(db, slug, member?.clerkUserId ?? null);
  if (!group) return null;
  const events = await listGroupEvents(db, group.id);
  return { group, events };
}

export async function loadGroupMembers(slug: string) {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const userId = member?.clerkUserId ?? null;
  const group = await getGroupBySlug(db, slug, userId);
  if (!group) return null;
  const [members, invites, joinRequests, directory] = await Promise.all([
    listMembers(db, group.id),
    listPendingInvites(db, group.id),
    listJoinRequests(db, group.id),
    db.membership.findMany({
      where: { status: "ACTIVE" },
      select: { clerkUserId: true, displayName: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Attach a display name to each pending join request.
  const nameById = new Map(directory.map((d) => [d.clerkUserId, d.displayName ?? d.email ?? d.clerkUserId]));
  const requests = joinRequests.map((r) => ({ ...r, requesterName: nameById.get(r.userId) ?? r.userId }));
  return { group, members, invites, joinRequests: requests, directory, currentUserId: userId };
}
