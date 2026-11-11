import { auth, currentUser } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getPlatformDb } from "@/lib/db/platform";
import { CHESS_DEMO_SCHEMA, CHESS_DEMO_SLUG, chessDemoModeActive } from "./demo-mode";

/**
 * Claim OWNER membership only for an existing, verified Clerk TEST user
 * with the exact allowlisted address and only in the isolated demo schema.
 * No auto-enrollment exists in production or for other tenants.
 */
export async function ensureChessDemoOwnerMembership(): Promise<void> {
  if (!chessDemoModeActive()) return;
  const { tenantId, schemaName, db } = getTenantDb();
  if (tenantId !== CHESS_DEMO_SLUG || schemaName !== CHESS_DEMO_SCHEMA) return;

  const clerkUserId = auth().userId;
  if (!clerkUserId) return;
  const user = await currentUser();
  const primary = user?.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );
  const email = primary?.emailAddress?.toLowerCase();
  if (!email || primary?.verification?.status !== "verified" ||
      email !== process.env.CHESS_DEMO_OWNER_EMAIL?.trim().toLowerCase()) return;

  const registry = await getPlatformDb().tenantRegistry.findUnique({
    where: { slug: CHESS_DEMO_SLUG },
    select: { schemaName: true, status: true, plan: true },
  });
  if (!registry || registry.schemaName !== CHESS_DEMO_SCHEMA ||
      registry.status !== "ACTIVE" || registry.plan !== "DEMO") return;

  await db.membership.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId, role: "OWNER", status: "ACTIVE",
      email, displayName: "CHESS Fictional Demo Owner",
    },
    update: {}, // An existing role/suspension may never be auto-promoted.
  });
}
