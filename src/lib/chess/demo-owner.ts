import { auth, currentUser } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getPlatformDb } from "@/lib/db/platform";
import { CHESS_DEMO_SCHEMA, CHESS_DEMO_SLUG, chessDemoModeActive } from "./demo-mode";

/**
 * Resolve only a verified Clerk TEST identity in the isolated fictional tenant.
 * No role or tenant membership is inferred from an unverified email address.
 */
async function verifiedDemoActor() {
  if (!chessDemoModeActive()) return null;
  const { tenantId, schemaName, db } = getTenantDb();
  if (tenantId !== CHESS_DEMO_SLUG || schemaName !== CHESS_DEMO_SCHEMA) return null;

  const clerkUserId = auth().userId;
  if (!clerkUserId) return null;
  const user = await currentUser();
  const primary = user?.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );
  const email = primary?.emailAddress?.trim().toLowerCase();
  if (!email || user?.id !== clerkUserId ||
      primary?.verification?.status !== "verified") return null;

  const registry = await getPlatformDb().tenantRegistry.findUnique({
    where: { slug: CHESS_DEMO_SLUG },
    select: { schemaName: true, status: true, plan: true },
  });
  if (!registry || registry.schemaName !== CHESS_DEMO_SCHEMA ||
      registry.status !== "ACTIVE" || registry.plan !== "DEMO") return null;

  return { db, clerkUserId, email };
}

/**
 * Claim OWNER membership only for the exact allowlisted, verified Clerk TEST
 * user. Existing roles and suspended memberships are never promoted.
 */
export async function ensureChessDemoOwnerMembership(): Promise<void> {
  const actor = await verifiedDemoActor();
  const ownerEmail = process.env.CHESS_DEMO_OWNER_EMAIL?.trim().toLowerCase();
  if (!actor || !ownerEmail || actor.email !== ownerEmail) return;

  await actor.db.membership.upsert({
    where: { clerkUserId: actor.clerkUserId },
    create: {
      clerkUserId: actor.clerkUserId,
      role: "OWNER",
      status: "ACTIVE",
      email: actor.email,
      displayName: "CHESS Fictional Demo Owner",
    },
    update: {}, // An existing role/suspension may never be auto-promoted.
  });
}

/**
 * Provision one explicitly allowlisted demo employee as MEMBER only.
 * The employee receives one SUPPORT assignment in the fictional bookkeeping
 * unit. Existing or revoked memberships/assignments are never upgraded or
 * restored. This helper cannot create a service grant or a financial approval.
 */
export async function ensureChessDemoEmployeeMembership(): Promise<void> {
  const actor = await verifiedDemoActor();
  const employeeEmail = process.env.CHESS_DEMO_EMPLOYEE_EMAIL?.trim().toLowerCase();
  const ownerEmail = process.env.CHESS_DEMO_OWNER_EMAIL?.trim().toLowerCase();
  if (!actor || !employeeEmail || actor.email !== employeeEmail ||
      employeeEmail === ownerEmail) return;

  const membership = await actor.db.membership.upsert({
    where: { clerkUserId: actor.clerkUserId },
    create: {
      clerkUserId: actor.clerkUserId,
      role: "MEMBER",
      status: "ACTIVE",
      email: actor.email,
      displayName: "CHESS Fictional Demo Employee",
    },
    update: {},
    select: { role: true, status: true },
  });
  if (membership.role !== "MEMBER" || membership.status !== "ACTIVE") return;

  const business = await actor.db.chessBusinessUnit.findUnique({
    where: { slug: "bookkeeping" },
    select: { id: true, status: true },
  });
  if (!business || business.status !== "ACTIVE") return;

  const assignment = await actor.db.chessEmployeeAssignment.upsert({
    where: {
      businessId_clerkUserId: {
        businessId: business.id,
        clerkUserId: actor.clerkUserId,
      },
    },
    create: {
      businessId: business.id,
      clerkUserId: actor.clerkUserId,
      role: "SUPPORT",
    },
    update: {}, // A revoked demo assignment is never silently reinstated.
    select: { revokedAt: true },
  });
  if (assignment.revokedAt) return;

  const title = "Fictional employee browser acceptance task";
  const existingTask = await actor.db.chessWorkItem.findFirst({
    where: { businessId: business.id, title },
    select: { id: true },
  });
  if (!existingTask) {
    await actor.db.chessWorkItem.create({
      data: {
        businessId: business.id,
        title,
        assignedClerkUserId: actor.clerkUserId,
      },
    });
  }
}
