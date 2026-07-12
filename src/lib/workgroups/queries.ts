/*
 * Workgroup read helpers (Sprint 22). Every function takes an explicit db so it
 * works inside a request scope (getTenantDb) and outside one (seed / cron).
 * Archived groups are excluded from discovery but still fetchable by slug.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { listPosts } from "@/lib/feed/queries";
import type { WorkgroupMemberRole } from "./workgroup-utils";

type Db = PrismaClient;

/** Attach a live member count to a set of groups in one grouped query. */
async function withMemberCounts<T extends { id: string }>(
  db: Db,
  groups: T[],
): Promise<(T & { memberCount: number })[]> {
  if (groups.length === 0) return [];
  const ids = groups.map((g) => g.id);
  const counts = await db.workgroupMember.groupBy({
    by: ["workgroupId"],
    where: { workgroupId: { in: ids } },
    _count: { _all: true },
  });
  const byId = new Map(counts.map((c) => [c.workgroupId, c._count._all]));
  return groups.map((g) => ({ ...g, memberCount: byId.get(g.id) ?? 0 }));
}

/** Groups the given user belongs to, active first, newest membership first. */
export async function listMyGroups(db: Db, userId: string) {
  const memberships = await db.workgroupMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    include: { workgroup: true },
  });
  const groups = memberships
    .map((m) => m.workgroup)
    .filter((g) => g.status === "ACTIVE");
  const withCounts = await withMemberCounts(db, groups);
  const roleByGroup = new Map(memberships.map((m) => [m.workgroupId, m.role as WorkgroupMemberRole]));
  return withCounts.map((g) => ({ ...g, myRole: roleByGroup.get(g.id) ?? null }));
}

/**
 * Discoverable groups the user is NOT already in: PUBLIC and PRIVATE are listed
 * (PRIVATE can be requested), SECRET groups are hidden from discovery.
 */
export async function listDiscover(db: Db, userId: string | null) {
  const mine = userId
    ? await db.workgroupMember.findMany({ where: { userId }, select: { workgroupId: true } })
    : [];
  const mineIds = new Set(mine.map((m) => m.workgroupId));
  const groups = await db.workgroup.findMany({
    where: { status: "ACTIVE", visibility: { in: ["PUBLIC", "PRIVATE"] } },
    orderBy: { createdAt: "desc" },
  });
  const visible = groups.filter((g) => !mineIds.has(g.id));
  return withMemberCounts(db, visible);
}

/** Fetch a group by slug with the current user's role and a member count. */
export async function getGroupBySlug(db: Db, slug: string, userId: string | null) {
  const group = await db.workgroup.findUnique({ where: { slug } });
  if (!group) return null;
  const [memberCount, membership] = await Promise.all([
    db.workgroupMember.count({ where: { workgroupId: group.id } }),
    userId
      ? db.workgroupMember.findUnique({
          where: { workgroupId_userId: { workgroupId: group.id, userId } },
          select: { role: true },
        })
      : Promise.resolve(null),
  ]);
  return {
    ...group,
    memberCount,
    myRole: (membership?.role as WorkgroupMemberRole | undefined) ?? null,
  };
}

/** Members of a group, owners/moderators first, then by join date. */
export async function listMembers(db: Db, workgroupId: string) {
  const members = await db.workgroupMember.findMany({
    where: { workgroupId },
    orderBy: { joinedAt: "asc" },
  });
  const ids = members.map((m) => m.userId);
  const memberships = ids.length
    ? await db.membership.findMany({
        where: { clerkUserId: { in: ids } },
        select: { clerkUserId: true, displayName: true, email: true },
      })
    : [];
  const profileById = new Map(memberships.map((p) => [p.clerkUserId, p]));
  const rank: Record<WorkgroupMemberRole, number> = { OWNER: 0, MODERATOR: 1, MEMBER: 2 };
  return members
    .map((m) => {
      const p = profileById.get(m.userId);
      return {
        ...m,
        displayName: p?.displayName ?? null,
        email: p?.email ?? null,
      };
    })
    .sort((a, b) => rank[a.role as WorkgroupMemberRole] - rank[b.role as WorkgroupMemberRole]);
}

/** Pending invites for a group, newest first. */
export async function listPendingInvites(db: Db, workgroupId: string) {
  return db.workgroupInvite.findMany({
    where: { workgroupId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

/** Pending join requests for a group, newest first. */
export async function listJoinRequests(db: Db, workgroupId: string) {
  return db.workgroupJoinRequest.findMany({
    where: { workgroupId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

/** Group feed: delegates to the feed helper scoped by workgroupId. */
export async function listGroupFeed(
  db: Db,
  workgroupId: string,
  opts: { cursor?: string | null; currentUserId?: string | null } = {},
) {
  return listPosts(db, {
    workgroupId,
    cursor: opts.cursor ?? null,
    currentUserId: opts.currentUserId ?? null,
  });
}

/** Tasks attached to a group, open first then by due date. */
export async function listGroupTasks(db: Db, workgroupId: string) {
  return db.task.findMany({
    where: { workgroupId, deletedAt: null },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

/** Files attached to a group, newest first. */
export async function listGroupFiles(db: Db, workgroupId: string) {
  return db.document.findMany({
    where: { workgroupId },
    orderBy: { updatedAt: "desc" },
  });
}

/** Calendar events attached to a group, soonest first. */
export async function listGroupEvents(db: Db, workgroupId: string) {
  return db.calendarEvent.findMany({
    where: { workgroupId },
    orderBy: { startAt: "asc" },
  });
}
