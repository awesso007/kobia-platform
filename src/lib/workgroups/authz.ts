/*
 * Workgroup access guards (Sprint 22). Run inside a request scope: resolve the
 * current tenant db + Clerk membership, look up the group by slug, and check the
 * caller's WorkgroupMember role. PUBLIC groups are viewable by any signed-in
 * user; PRIVATE/SECRET groups require membership. requireGroupRole narrows to a
 * given role set (e.g. OWNER/MODERATOR for management actions).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import type { WorkgroupMemberRole } from "./workgroup-utils";

export class GroupAccessError extends Error {
  status = 403;
  constructor(message = "You do not have access to this workgroup.") {
    super(message);
    this.name = "GroupAccessError";
  }
}

export class GroupNotFoundError extends Error {
  status = 404;
  constructor(message = "Workgroup not found.") {
    super(message);
    this.name = "GroupNotFoundError";
  }
}

export type GroupContext = {
  db: PrismaClient;
  group: {
    id: string;
    slug: string;
    name: string;
    visibility: "PUBLIC" | "PRIVATE" | "SECRET";
    status: "ACTIVE" | "ARCHIVED";
    ownerId: string;
    chatChannelId: string | null;
  };
  userId: string | null;
  role: WorkgroupMemberRole | null;
};

/** Resolve the group by slug plus the current user's membership role (or null). */
async function loadGroupContext(slug: string): Promise<GroupContext> {
  const { db } = getTenantDb();
  const group = await db.workgroup.findUnique({ where: { slug } });
  if (!group) throw new GroupNotFoundError();

  const member = await getCurrentMembership();
  const userId = member?.clerkUserId ?? null;

  let role: WorkgroupMemberRole | null = null;
  if (userId) {
    const wm = await db.workgroupMember.findUnique({
      where: { workgroupId_userId: { workgroupId: group.id, userId } },
      select: { role: true },
    });
    role = (wm?.role as WorkgroupMemberRole | undefined) ?? null;
  }

  return {
    db,
    group: {
      id: group.id,
      slug: group.slug,
      name: group.name,
      visibility: group.visibility,
      status: group.status,
      ownerId: group.ownerId,
      chatChannelId: group.chatChannelId,
    },
    userId,
    role,
  };
}

/**
 * Require the caller to be able to view the group. Members always may; for
 * PUBLIC groups any signed-in user may (role stays null). PRIVATE/SECRET groups
 * require membership.
 */
export async function requireGroupMember(slug: string): Promise<GroupContext> {
  const ctx = await loadGroupContext(slug);
  if (ctx.role) return ctx;
  if (ctx.group.visibility === "PUBLIC") return ctx;
  throw new GroupAccessError();
}

/** Require the caller to hold one of the given roles in the group. */
export async function requireGroupRole(
  slug: string,
  roles: WorkgroupMemberRole[],
): Promise<GroupContext> {
  const ctx = await loadGroupContext(slug);
  if (ctx.role && roles.includes(ctx.role)) return ctx;
  throw new GroupAccessError();
}
