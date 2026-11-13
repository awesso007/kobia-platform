/*
 * require-permission.ts - server-side RBAC guard (Sprint 5).
 *
 * requirePermission(action, opts) resolves the current Clerk user, loads their
 * tenant Membership (via getTenantDb), and throws PermissionError if the role
 * lacks the capability. Wrap every CRUD server action with it.
 *
 * Security policy: production request authorization fails closed. Missing Clerk
 * session, missing tenant, unresolved membership, or non-ACTIVE membership
 * must never grant access. Seed scripts use explicit trusted data access instead.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { can, type Action, type Role } from "./permissions";

export class PermissionError extends Error {
  status = 403;
  constructor(action: Action, role?: Role) {
    super(role ? `Role ${role} is not permitted to ${action}.` : `Not permitted to ${action}.`);
    this.name = "PermissionError";
  }
}

export type CurrentMember = {
  clerkUserId: string;
  role: Role;
  email: string | null;
  displayName: string | null;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

/** True if `ownerUserId` matches the current Clerk user (for MEMBER own-record writes). */
export async function isOwn(ownerUserId: string | null | undefined): Promise<boolean> {
  if (!ownerUserId) return false;
  const member = await getCurrentMembership();
  return member?.clerkUserId === ownerUserId;
}

/** Resolve the current user's Membership in the active tenant, or null. */
export async function getCurrentMembership(): Promise<CurrentMember | null> {
  let clerkUserId: string | null = null;
  try {
    clerkUserId = auth().userId ?? null;
  } catch {
    return null; // outside a request scope (seed scripts)
  }
  if (!clerkUserId) return null;

  try {
    const { db } = getTenantDb();
    const m = await db.membership.findUnique({ where: { clerkUserId } });
    if (!m) return null;
    return {
      clerkUserId: m.clerkUserId,
      role: m.role as Role,
      email: m.email,
      displayName: m.displayName,
      status: m.status as CurrentMember["status"],
    };
  } catch {
    return null;
  }
}

/**
 * Throw PermissionError if the current member's role cannot perform `action`.
 * Denies when membership cannot be resolved or is not ACTIVE.
 *
 * opts.ownsRecord lets a MEMBER update records they own.
 */
export async function requirePermission(
  action: Action,
  opts?: { ownsRecord?: boolean },
): Promise<void> {
  const member = await getCurrentMembership();
  if (!member) throw new PermissionError(action);
  if (member.status !== "ACTIVE") throw new PermissionError(action, member.role);
  if (!can(member.role, action, opts)) {
    throw new PermissionError(action, member.role);
  }
}
