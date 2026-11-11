import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { canAccessService, canReadClientProfile, canWriteClientProfile } from "./policy";
import type { ClientService, ProfileActor, ServiceGrant } from "./policy";
import { z } from "zod";

const createInput = z.object({
  displayName: z.string().trim().min(1).max(200),
  contactId: z.string().min(1).max(128).optional(),
}).strict();

const idInput = z.string().min(1).max(128);
const serviceInput = z.enum([
  "ACCOUNTING", "BOOKKEEPING", "PAYROLL", "TAX",
  "MORTGAGE", "INSURANCE", "REAL_ESTATE", "INVESTMENTS",
]);

async function currentActor(): Promise<ProfileActor> {
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:read");
  return { clerkUserId: member.clerkUserId, role: member.role, status: member.status };
}

/** Returns only nonsensitive profile summaries and never service records. */
export async function listClientProfiles() {
  await requirePermission("record:read");
  const actor = await currentActor();
  const { db } = getTenantDb();
  return db.clientProfile.findMany({
    where: actor.role === "OWNER" || actor.role === "ADMIN"
      ? {} : { ownerClerkUserId: actor.clerkUserId },
    select: { id: true, displayName: true, contactId: true, ownerClerkUserId: true, createdAt: true, updatedAt: true },
    orderBy: { displayName: "asc" },
    take: 100,
  });
}

export async function createClientProfile(input: unknown) {
  await requirePermission("record:create");
  const actor = await currentActor();
  const data = createInput.parse(input);
  const { db } = getTenantDb();
  if (data.contactId) {
    const contact = await db.contact.findUnique({ where: { id: data.contactId }, select: { id: true } });
    if (!contact) throw new Error("Contact not found in active tenant.");
  }
  return db.clientProfile.create({
    data: { displayName: data.displayName, contactId: data.contactId, ownerClerkUserId: actor.clerkUserId },
    select: { id: true, displayName: true, contactId: true, ownerClerkUserId: true, createdAt: true, updatedAt: true },
  });
}

export async function getClientProfile(profileId: string) {
  await requirePermission("record:read");
  const actor = await currentActor();
  const { db } = getTenantDb();
  const profile = await db.clientProfile.findUnique({
    where: { id: idInput.parse(profileId) },
    select: { id: true, displayName: true, contactId: true, ownerClerkUserId: true, createdAt: true, updatedAt: true },
  });
  if (!profile || !canReadClientProfile(actor, profile.ownerClerkUserId)) {
    throw new PermissionError("record:read");
  }
  return profile;
}

/** A service link is only returned to an explicitly granted employee.
 * Never return external IDs to a user based solely on CRM admin permissions. */
export async function getClientServiceLink(profileId: string, service: ClientService) {
  await getClientProfile(profileId);
  const actor = await currentActor();
  const { db } = getTenantDb();
  const link = await db.clientServiceLink.findUnique({
    where: { profileId_service: { profileId: idInput.parse(profileId), service: serviceInput.parse(service) } },
    include: { grants: true },
  });
  if (!link) return null;
  const grants: ServiceGrant[] = link.grants.map(grant => ({
    clerkUserId: grant.clerkUserId, service, canRead: grant.canRead,
    canWrite: grant.canWrite, revokedAt: grant.revokedAt,
  }));
  if (!canAccessService(actor, service, grants, "read")) throw new PermissionError("record:read");
  return { id: link.id, profileId: link.profileId, service: link.service, externalId: link.externalId };
}

/** The initial administrative provisioning path. Service data is not accessible
 * until an explicit grant exists, including for the creator. */
export async function createClientServiceLink(profileId: string, service: ClientService) {
  await getClientProfile(profileId);
  const actor = await currentActor();
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new PermissionError("record:update");
  const { db } = getTenantDb();
  return db.clientServiceLink.upsert({
    where: { profileId_service: { profileId: idInput.parse(profileId), service: serviceInput.parse(service) } },
    create: { profileId, service },
    update: {},
    select: { id: true, profileId: true, service: true },
  });
}

export async function setClientServiceGrant(
  linkId: string, clerkUserId: string, privileges: { canRead: boolean; canWrite: boolean },
) {
  const actor = await currentActor();
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new PermissionError("member:manage");
  if (privileges.canWrite && !privileges.canRead) throw new Error("Write permission requires read permission.");
  const { db } = getTenantDb();
  const target = await db.membership.findUnique({ where: { clerkUserId: idInput.parse(clerkUserId) } });
  if (!target || target.status !== "ACTIVE" || target.role === "VIEWER") throw new PermissionError("member:manage");
  const link = await db.clientServiceLink.findUnique({ where: { id: idInput.parse(linkId) }, select: { id: true } });
  if (!link) throw new Error("Service link not found in active tenant.");
  return db.clientServiceGrant.upsert({
    where: { linkId_clerkUserId: { linkId, clerkUserId } },
    create: { linkId, clerkUserId, ...privileges },
    update: { ...privileges, revokedAt: null },
    select: { id: true, linkId: true, clerkUserId: true, canRead: true, canWrite: true, revokedAt: true },
  });
}

export async function revokeClientServiceGrant(linkId: string, clerkUserId: string) {
  const actor = await currentActor();
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new PermissionError("member:manage");
  const { db } = getTenantDb();
  return db.clientServiceGrant.updateMany({
    where: { linkId: idInput.parse(linkId), clerkUserId: idInput.parse(clerkUserId), revokedAt: null },
    data: { revokedAt: new Date(), canRead: false, canWrite: false },
  });
}
