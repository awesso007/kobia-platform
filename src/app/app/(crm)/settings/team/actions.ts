"use server";

/*
 * Team (RBAC) server actions. Manage tenant Memberships: invite, change role,
 * suspend/reactivate, remove. All guarded by requirePermission("member:manage").
 * Owner-only rules (cannot demote the last owner, only Owner removes members)
 * are enforced here on top of the coarse capability check.
 *
 * Clerk invitations: when CLERK_SECRET_KEY is configured we attempt
 * clerkClient.invitations.createInvitation. If Clerk is not configured (or the
 * call fails) we still create the INVITED Membership row and log a clear
 * "would invite" message - the row is the source of truth for the team list.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import type { Role } from "@/lib/rbac/permissions";

const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
function asRole(v: unknown): Role {
  return (ROLES as readonly string[]).includes(v as string) ? (v as Role) : "MEMBER";
}

export type InviteInput = { email: string; role: string; displayName?: string };

export async function inviteMember(input: InviteInput) {
  await requirePermission("member:manage");
  const email = input.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("A valid email is required to invite a member.");
  }
  const role = asRole(input.role);
  if (role === "OWNER") throw new Error("Invited members cannot be Owners. Transfer ownership instead.");
  const { db } = getTenantDb();

  // A pending Clerk invitation has no clerkUserId yet, so we key the INVITED
  // row by a synthetic placeholder id derived from the email. It is swapped for
  // the real Clerk user id on first sign-in (onboarding / ensure flow).
  const placeholderId = `invited:${email}`;
  await db.membership.upsert({
    where: { clerkUserId: placeholderId },
    create: { clerkUserId: placeholderId, email, displayName: input.displayName?.trim() || null, role, status: "INVITED" },
    update: { email, role, status: "INVITED" },
  });

  let clerkInvited = false;
  if (process.env.CLERK_SECRET_KEY) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.invitations.createInvitation({ emailAddress: email });
      clerkInvited = true;
    } catch (err) {
      console.warn(`[inviteMember] Clerk invitation failed for ${email}; INVITED row created anyway.`, err);
    }
  } else {
    console.log(`[inviteMember] CLERK_SECRET_KEY not set; would invite ${email} as ${role}.`);
  }

  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: placeholderId, diff: { invited: email, role, clerkInvited } });
  revalidatePath("/app/settings/team");
  return { clerkInvited };
}

export async function changeMemberRole(membershipId: string, role: string) {
  await requirePermission("member:manage");
  const next = asRole(role);
  const { db } = getTenantDb();
  const target = await db.membership.findUniqueOrThrow({ where: { id: membershipId } });
  const me = await getCurrentMembership();

  // Owner can change anyone except themselves to a non-Owner role; an Admin can
  // only change Member/Viewer (not touch Owners or other Admins, and cannot
  // grant Owner).
  if (me) {
    if (me.role === "ADMIN") {
      if (target.role === "OWNER" || target.role === "ADMIN") throw new Error("Admins cannot change Owners or Admins.");
      if (next === "OWNER") throw new Error("Admins cannot grant the Owner role.");
    }
    if (me.role === "OWNER" && target.clerkUserId === me.clerkUserId && next !== "OWNER") {
      // Prevent the sole owner from demoting themselves and locking the tenant.
      const owners = await db.membership.count({ where: { role: "OWNER", status: "ACTIVE" } });
      if (owners <= 1) throw new Error("Cannot demote the last Owner. Assign another Owner first.");
    }
  }

  await db.membership.update({ where: { id: membershipId }, data: { role: next } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: membershipId, diff: { role: next } });
  revalidatePath("/app/settings/team");
}

export async function setMemberStatus(membershipId: string, status: "ACTIVE" | "SUSPENDED") {
  await requirePermission("member:manage");
  const { db } = getTenantDb();
  const target = await db.membership.findUniqueOrThrow({ where: { id: membershipId } });
  if (target.role === "OWNER" && status === "SUSPENDED") {
    const owners = await db.membership.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) throw new Error("Cannot suspend the last active Owner.");
  }
  await db.membership.update({ where: { id: membershipId }, data: { status } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: membershipId, diff: { status } });
  revalidatePath("/app/settings/team");
}

export async function removeMember(membershipId: string) {
  // Removal is Owner-only per spec.
  const me = await getCurrentMembership();
  if (me && me.role !== "OWNER") throw new Error("Only an Owner can remove members.");
  await requirePermission("member:manage");
  const { db } = getTenantDb();
  const target = await db.membership.findUniqueOrThrow({ where: { id: membershipId } });
  if (target.role === "OWNER") {
    const owners = await db.membership.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) throw new Error("Cannot remove the last Owner.");
  }
  await db.membership.delete({ where: { id: membershipId } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: membershipId, diff: { removedMember: target.email } });
  revalidatePath("/app/settings/team");
}
