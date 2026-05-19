/**
 * Auth helpers — wraps Clerk with KOBIA tenant context.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { Membership, Role, Tenant, User } from "@prisma/client";

export type AuthContext = {
  user: User;
  tenant: Tenant;
  membership: Membership;
  role: Role;
};

/**
 * Get the current authenticated user + their active tenant.
 * Returns null if unauthenticated or no membership exists.
 */
export async function getAuthContext(tenantSlug: string): Promise<AuthContext | null> {
  const { userId: clerkUserId } = auth();
  if (!clerkUserId) return null;

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || !tenant.isActive) return null;

  const user = await db.user.findUnique({ where: { clerkUserId } });
  if (!user) return null;

  const membership = await db.membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
  });
  if (!membership || !membership.isActive) return null;

  return { user, tenant, membership, role: membership.role };
}

/**
 * Sync Clerk user to KOBIA user table.
 * Call this on first sign-in or via Clerk webhook.
 */
export async function syncUserFromClerk(): Promise<User | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress;
  if (!primaryEmail) return null;

  return db.user.upsert({
    where: { clerkUserId: clerkUser.id },
    update: {
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
    create: {
      clerkUserId: clerkUser.id,
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
  });
}

/**
 * Role check helper.
 */
export function hasRole(ctx: AuthContext, allowed: Role[]): boolean {
  return allowed.includes(ctx.role);
}
