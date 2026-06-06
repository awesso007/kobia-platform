/*
 * user-tenants.ts (Sprint 5). Resolve which tenants a Clerk user belongs to by
 * scanning each ACTIVE tenant schema for a Membership keyed by their user id.
 *
 * Membership lives in the per-tenant schema (there is no global membership
 * table), so finding "all tenants for a user" requires checking each tenant.
 * For the v0.1 alpha this is a handful of tenants; if the registry grows this
 * should move to a denormalized index. Used by the onboarding guard and the
 * tenant switcher.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { auth } from "@clerk/nextjs/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";

export type UserTenant = { slug: string; displayName: string | null; role: string };

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export async function listUserTenants(): Promise<UserTenant[]> {
  const clerkUserId = currentUserId();
  if (!clerkUserId) return [];

  let tenants: { slug: string; schemaName: string; displayName: string | null }[] = [];
  try {
    const { PrismaClient } = await import("@/lib/db/generated/platform");
    const platform = new PrismaClient();
    try {
      tenants = await platform.tenantRegistry.findMany({
        where: { status: "ACTIVE" },
        select: { slug: true, schemaName: true, displayName: true },
      });
    } finally {
      await platform.$disconnect();
    }
  } catch {
    return [];
  }

  const out: UserTenant[] = [];
  for (const t of tenants) {
    try {
      const db = getTenantPrisma(t.schemaName);
      const m = await db.membership.findUnique({ where: { clerkUserId }, select: { role: true, status: true } });
      if (m && m.status !== "SUSPENDED") {
        out.push({ slug: t.slug, displayName: t.displayName, role: m.role as string });
      }
    } catch {
      // schema may predate the Membership table; skip it.
    }
  }
  return out;
}

/** True if the user has a Clerk session but belongs to no tenant. */
export async function userNeedsOnboarding(): Promise<boolean> {
  const clerkUserId = currentUserId();
  if (!clerkUserId) return false; // unauthenticated users are handled by middleware
  const tenants = await listUserTenants();
  return tenants.length === 0;
}
