/*
 * Workgroup write helpers (Sprint 22). Every function takes an explicit db so it
 * works inside a request scope (getTenantDb) and outside one (seed / cron).
 *
 * createGroup also provisions a backing chat channel via the chat lib and seeds
 * the owner membership. Member/invite/join flows dispatch the matching WORKGROUP
 * automation events and drop in-app notifications (SYSTEM type, since there is no
 * dedicated workgroup NotificationType). All automation/notify calls are
 * best-effort and never break the underlying write.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { notifyOn } from "@/lib/notifications/notify";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { createChannel } from "@/lib/chat/mutations";
import { slugifyName, type WorkgroupMemberRole, type WorkgroupVisibility } from "./workgroup-utils";

type Db = PrismaClient;

/** Ensure a slug is unique in the Workgroup table, appending -2, -3, ... */
async function uniqueSlug(db: Db, base: string): Promise<string> {
  const root = slugifyName(base) || "group";
  let slug = root;
  let n = 1;
  while (await db.workgroup.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${root}-${n}`;
  }
  return slug;
}

export type CreateGroupInput = {
  name: string;
  description?: string | null;
  visibility?: WorkgroupVisibility;
  icon?: string | null;
  coverColor?: string | null;
  ownerId: string;
};

/**
 * Create a workgroup, its owner membership, and a backing chat channel. Returns
 * the new group id. Dispatches WORKGROUP_CREATED.
 */
export async function createGroup(db: Db, input: CreateGroupInput): Promise<string> {
  const slug = await uniqueSlug(db, input.name);
  const group = await db.workgroup.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      visibility: input.visibility ?? "PUBLIC",
      icon: input.icon?.trim() || null,
      coverColor: input.coverColor?.trim() || "#4f46e5",
      ownerId: input.ownerId,
    },
  });

  await db.workgroupMember.create({
    data: { workgroupId: group.id, userId: input.ownerId, role: "OWNER" },
  });

  // Back the group with a chat channel. The chat lib does not accept a
  // workgroupId, so link it after creation. Best-effort: a channel failure must
  // not roll back the group.
  try {
    const channelKind = input.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE";
    const channelId = await createChannel(db, {
      name: input.name,
      description: input.description ?? null,
      kind: channelKind,
      createdById: input.ownerId,
    });
    await db.chatChannel.update({ where: { id: channelId }, data: { workgroupId: group.id } });
    await db.workgroup.update({ where: { id: group.id }, data: { chatChannelId: channelId } });
  } catch (err) {
    console.error("[workgroups] failed to create backing chat channel", err);
  }

  const record = { name: group.name, slug: group.slug, visibility: group.visibility, ownerId: group.ownerId };
  await dispatchAutomation({ type: "WORKGROUP_CREATED", entityType: "WORKGROUP", entityId: group.id, record }, db);

  return group.id;
}

/** Add a member (idempotent on the workgroup+user pair). Returns the member row. */
export async function addMember(
  db: Db,
  input: { workgroupId: string; userId: string; role?: WorkgroupMemberRole },
) {
  const existing = await db.workgroupMember.findUnique({
    where: { workgroupId_userId: { workgroupId: input.workgroupId, userId: input.userId } },
  });
  if (existing) return existing;
  const member = await db.workgroupMember.create({
    data: { workgroupId: input.workgroupId, userId: input.userId, role: input.role ?? "MEMBER" },
  });
  await dispatchAutomation(
    { type: "WORKGROUP_MEMBER_JOINED", entityType: "WORKGROUP", entityId: input.workgroupId, payload: { userId: input.userId } },
    db,
  );
  return member;
}

/** Remove a member. The owner cannot be removed. */
export async function removeMember(db: Db, workgroupId: string, userId: string): Promise<void> {
  const group = await db.workgroup.findUnique({ where: { id: workgroupId }, select: { ownerId: true } });
  if (group && group.ownerId === userId) throw new Error("The owner cannot be removed from the group.");
  await db.workgroupMember.deleteMany({ where: { workgroupId, userId } });
}

/** Change a member's role. The owner's role is fixed at OWNER. */
export async function changeRole(
  db: Db,
  workgroupId: string,
  userId: string,
  role: WorkgroupMemberRole,
): Promise<void> {
  const group = await db.workgroup.findUnique({ where: { id: workgroupId }, select: { ownerId: true } });
  if (group && group.ownerId === userId) throw new Error("The owner role cannot be changed.");
  await db.workgroupMember.updateMany({ where: { workgroupId, userId }, data: { role } });
}

/** Current member leaves a group. The owner must transfer ownership first. */
export async function leaveGroup(db: Db, workgroupId: string, userId: string): Promise<void> {
  const group = await db.workgroup.findUnique({ where: { id: workgroupId }, select: { ownerId: true } });
  if (group && group.ownerId === userId) throw new Error("The owner cannot leave the group.");
  await db.workgroupMember.deleteMany({ where: { workgroupId, userId } });
}

async function createInvite(
  db: Db,
  input: { workgroupId: string; inviterId: string; inviteeUserId?: string | null; inviteeEmail?: string | null },
) {
  const token = randomBytes(32).toString("hex");
  const invite = await db.workgroupInvite.create({
    data: {
      workgroupId: input.workgroupId,
      inviterId: input.inviterId,
      inviteeUserId: input.inviteeUserId ?? null,
      inviteeEmail: input.inviteeEmail ?? null,
      token,
    },
  });
  const group = await db.workgroup.findUnique({ where: { id: input.workgroupId }, select: { name: true, slug: true } });
  if (input.inviteeUserId) {
    await notifyOn(db, input.inviteeUserId, {
      type: "SYSTEM",
      title: `You were invited to ${group?.name ?? "a workgroup"}`,
      body: "Open the invite to join the group.",
      linkUrl: `/app/workgroups/join/${token}`,
    });
  }
  await dispatchAutomation(
    { type: "WORKGROUP_INVITE_SENT", entityType: "WORKGROUP", entityId: input.workgroupId, payload: { inviteId: invite.id, inviteeUserId: input.inviteeUserId ?? null, inviteeEmail: input.inviteeEmail ?? null } },
    db,
  );
  return invite;
}

/** Invite a known user by clerk user id. */
export async function inviteByUserId(
  db: Db,
  input: { workgroupId: string; inviterId: string; inviteeUserId: string },
) {
  return createInvite(db, { workgroupId: input.workgroupId, inviterId: input.inviterId, inviteeUserId: input.inviteeUserId });
}

/** Invite by email (external or unknown user); notification is by token link. */
export async function inviteByEmail(
  db: Db,
  input: { workgroupId: string; inviterId: string; inviteeEmail: string },
) {
  return createInvite(db, { workgroupId: input.workgroupId, inviterId: input.inviterId, inviteeEmail: input.inviteeEmail.trim().toLowerCase() });
}

/**
 * Accept a pending invite for a user. Adds the member, marks the invite
 * ACCEPTED, and dispatches WORKGROUP_MEMBER_JOINED (via addMember). Returns the
 * group slug so the caller can redirect.
 */
export async function acceptInvite(db: Db, token: string, userId: string): Promise<{ slug: string }> {
  const invite = await db.workgroupInvite.findUnique({ where: { token } });
  if (!invite) throw new Error("Invite not found.");
  if (invite.status !== "PENDING") throw new Error("This invite is no longer valid.");
  await addMember(db, { workgroupId: invite.workgroupId, userId });
  await db.workgroupInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", respondedAt: new Date(), inviteeUserId: invite.inviteeUserId ?? userId },
  });
  const group = await db.workgroup.findUnique({ where: { id: invite.workgroupId }, select: { slug: true } });
  return { slug: group?.slug ?? "" };
}

/**
 * Request to join a group, or join directly when the group is PUBLIC. Returns
 * whether the user is now a member (direct join) or a request is pending.
 */
export async function requestJoin(
  db: Db,
  input: { workgroupId: string; userId: string; message?: string | null },
): Promise<{ joined: boolean }> {
  const group = await db.workgroup.findUnique({ where: { id: input.workgroupId }, select: { visibility: true, name: true, ownerId: true } });
  if (!group) throw new Error("Workgroup not found.");

  if (group.visibility === "PUBLIC") {
    await addMember(db, { workgroupId: input.workgroupId, userId: input.userId });
    return { joined: true };
  }

  const existing = await db.workgroupJoinRequest.findFirst({
    where: { workgroupId: input.workgroupId, userId: input.userId, status: "PENDING" },
  });
  if (!existing) {
    await db.workgroupJoinRequest.create({
      data: { workgroupId: input.workgroupId, userId: input.userId, message: input.message?.trim() || null },
    });
  }

  // Notify owner + moderators.
  const managers = await db.workgroupMember.findMany({
    where: { workgroupId: input.workgroupId, role: { in: ["OWNER", "MODERATOR"] } },
    select: { userId: true },
  });
  for (const m of managers) {
    await notifyOn(db, m.userId, {
      type: "SYSTEM",
      title: `New request to join ${group.name}`,
      body: input.message?.slice(0, 140) || undefined,
      linkUrl: `/app/workgroups`,
    });
  }
  await dispatchAutomation(
    { type: "WORKGROUP_JOIN_REQUESTED", entityType: "WORKGROUP", entityId: input.workgroupId, payload: { userId: input.userId } },
    db,
  );
  return { joined: false };
}

/** Approve a pending join request, creating the membership. */
export async function approveJoin(db: Db, requestId: string): Promise<void> {
  const req = await db.workgroupJoinRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return;
  await addMember(db, { workgroupId: req.workgroupId, userId: req.userId });
  await db.workgroupJoinRequest.update({
    where: { id: requestId },
    data: { status: "APPROVED", respondedAt: new Date() },
  });
  const group = await db.workgroup.findUnique({ where: { id: req.workgroupId }, select: { name: true, slug: true } });
  await notifyOn(db, req.userId, {
    type: "SYSTEM",
    title: `Your request to join ${group?.name ?? "the group"} was approved`,
    linkUrl: group?.slug ? `/app/workgroups/${group.slug}` : "/app/workgroups",
  });
}

/** Reject a pending join request. */
export async function rejectJoin(db: Db, requestId: string): Promise<void> {
  const req = await db.workgroupJoinRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return;
  await db.workgroupJoinRequest.update({
    where: { id: requestId },
    data: { status: "REJECTED", respondedAt: new Date() },
  });
}

export type UpdateGroupInput = {
  name?: string;
  description?: string | null;
  visibility?: WorkgroupVisibility;
  icon?: string | null;
  coverColor?: string | null;
};

/** Update editable group settings. */
export async function updateGroup(db: Db, workgroupId: string, input: UpdateGroupInput): Promise<void> {
  await db.workgroup.update({
    where: { id: workgroupId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.icon !== undefined ? { icon: input.icon?.trim() || null } : {}),
      ...(input.coverColor !== undefined ? { coverColor: input.coverColor?.trim() || "#4f46e5" } : {}),
    },
  });
}

/** Archive a group (soft close; delete maps to this per spec). */
export async function archiveGroup(db: Db, workgroupId: string): Promise<void> {
  await db.workgroup.update({ where: { id: workgroupId }, data: { status: "ARCHIVED" } });
}
