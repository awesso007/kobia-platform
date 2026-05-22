/**
 * ensureMembership — idempotently make sure the current Clerk user has a
 * KOBIA User record AND an active Membership for the given tenant.
 *
 * Called from:
 *   - /welcome page (first hit after signup)
 *   - completeOnboarding action (final safety net before /dashboard)
 *   - tenant layout (auto-heal if anything slipped through)
 *
 * Rule: first member of a tenant becomes OWNER. Subsequent members default
 * to STAFF (real invite flow will override role).
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { Membership, User, Role } from "@prisma/client";

export type EnsureResult =
  | { ok: true; user: User; membership: Membership }
  | { ok: false; reason: "not_authenticated" | "no_email" | "tenant_not_found" };

export async function ensureMembership(tenantSlug: string): Promise<EnsureResult> {
  const { userId: clerkUserId } = auth();
  if (!clerkUserId) return { ok: false, reason: "not_authenticated" };

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || !tenant.isActive) return { ok: false, reason: "tenant_not_found" };

  // Pull / upsert the User record from Clerk.
  const clerkUser = await currentUser();
  if (!clerkUser) return { ok: false, reason: "not_authenticated" };

  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress;
  if (!primaryEmail) return { ok: false, reason: "no_email" };

  const user = await db.user.upsert({
    where: { clerkUserId },
    update: {
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
    create: {
      clerkUserId,
      email: primaryEmail,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
  });

  // Membership for this tenant.
  let membership = await db.membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
  });

  if (!membership) {
    // First member becomes OWNER. Anyone else defaults to STAFF.
    const memberCount = await db.membership.count({ where: { tenantId: tenant.id } });
    const role: Role = memberCount === 0 ? "OWNER" : "STAFF";

    membership = await db.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role,
        isActive: true,
        acceptedAt: new Date(),
      },
    });
  } else if (!membership.isActive) {
    membership = await db.membership.update({
      where: { id: membership.id },
      data: { isActive: true, acceptedAt: membership.acceptedAt ?? new Date() },
    });
  }

  return { ok: true, user, membership };
}
