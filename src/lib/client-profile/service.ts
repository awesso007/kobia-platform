import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { canReadClientProfile } from "./policy";
import type { ClientService, ProfileActor } from "./policy";
import { z } from "zod";
import { assertBusinessAccess } from "@/lib/chess/business-units";
import {auditedClientServiceRead} from "./service-access-audit";

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
export async function getClientServiceLink(profileId: string, businessId: string, service: ClientService) {
  await assertBusinessAccess(idInput.parse(businessId));
  await getClientProfile(profileId);
  const actor = await currentActor();
  const { db } = getTenantDb();
  // Read the active grant and write an immutable, privacy-limited decision
  // event in one tenant-local transaction. An audit failure denies the read.
  const result=await auditedClientServiceRead(db,{
    profileId:idInput.parse(profileId),
    businessId:idInput.parse(businessId),
    service:serviceInput.parse(service),
    actor,
  });
  if(result.status==="NOT_FOUND")return null;
  if(result.status==="DENIED")throw new PermissionError("record:read");
  return result.link;
}

/** The initial administrative provisioning path. Service data is not accessible
 * until an explicit grant exists, including for the creator. */
export async function createClientServiceLink(profileId: string, businessId: string, service: ClientService) {
  await assertBusinessAccess(idInput.parse(businessId));
  await getClientProfile(profileId);
  const actor = await currentActor();
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new PermissionError("record:update");
  const { db } = getTenantDb();
  return db.clientServiceLink.upsert({
    where: { profileId_businessId_service: { profileId: idInput.parse(profileId), businessId: idInput.parse(businessId), service: serviceInput.parse(service) } },
    create: { profileId, businessId, service },
    update: {},
    select: { id: true, profileId: true, businessId: true, service: true },
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
  const link = await db.clientServiceLink.findUnique({ where: { id: idInput.parse(linkId) }, select: { id: true, businessId: true } });
  if (!link) throw new Error("Service link not found in active tenant.");
  await assertBusinessAccess(link.businessId);
  return db.$transaction(async tx => {
    const grant = await tx.clientServiceGrant.upsert({
      where: { linkId_clerkUserId: { linkId, clerkUserId } },
      create: { linkId, clerkUserId, ...privileges },
      update: { ...privileges, revokedAt: null },
      select: { id: true, linkId: true, clerkUserId: true, canRead: true, canWrite: true, revokedAt: true },
    });
    await tx.chessSecurityEvent.create({data:{
      businessId:link.businessId,actorClerkUserId:actor.clerkUserId,
      action:"SERVICE_GRANT_UPDATED",resourceType:"ClientServiceGrant",resourceId:grant.id,decision:"ALLOW",
    }});
    return grant;
  });
}

export async function revokeClientServiceGrant(linkId: string, clerkUserId: string) {
  const actor = await currentActor();
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new PermissionError("member:manage");
  const { db } = getTenantDb();
  const link = await db.clientServiceLink.findUnique({ where: { id: idInput.parse(linkId) }, select: { businessId: true } });
  if (!link) throw new PermissionError("member:manage");
  await assertBusinessAccess(link.businessId);
  return db.$transaction(async tx => {
    const result = await tx.clientServiceGrant.updateMany({
      where: { linkId: idInput.parse(linkId), clerkUserId: idInput.parse(clerkUserId), revokedAt: null },
      data: { revokedAt: new Date(), canRead: false, canWrite: false },
    });
    if (result.count > 0) {
      await tx.chessSecurityEvent.create({data:{
        businessId:link.businessId,actorClerkUserId:actor.clerkUserId,
        action:"SERVICE_GRANT_REVOKED",resourceType:"ClientServiceGrant",resourceId:linkId,decision:"ALLOW",
      }});
    }
    return result;
  });
}


/** Restricted provisioning metadata, not access to underlying service
 * records or financial/legal documents. All actions are checked again
 * by the existing service-specific mutation APIs. */
export async function getClientProvisioning(profileId:string){
 const actor=await currentActor();
 if(actor.role!=="OWNER"&&actor.role!=="ADMIN")
  throw new PermissionError("member:manage");
 const profile=await getClientProfile(idInput.parse(profileId));
 const {db}=getTenantDb();
 const [businesses,members,links,consents]=await Promise.all([
  db.chessBusinessUnit.findMany({where:{status:"ACTIVE"},
   select:{id:true,name:true,slug:true},orderBy:{name:"asc"},take:100}),
  db.membership.findMany({where:{status:"ACTIVE",role:{not:"VIEWER"}},
   select:{clerkUserId:true,displayName:true,role:true},take:100}),
  db.clientServiceLink.findMany({where:{profileId:profile.id},
   select:{id:true,businessId:true,service:true,
    grants:{select:{id:true,clerkUserId:true,canRead:true,canWrite:true,revokedAt:true}}},
   orderBy:{createdAt:"desc"},take:100}),
  db.chessClientConsent.findMany({where:{clientProfileId:profile.id},
   select:{id:true,businessId:true,purpose:true,policyVersion:true,status:true,
    createdAt:true,expiresAt:true,consentedAt:true,withdrawnAt:true},
   orderBy:{createdAt:"desc"},take:100}),
 ]);
 const active=new Set(businesses.map(x=>x.id));
 // Only list service-case metadata for this specific admin's explicit
 // current service grants; workspace administration is not record access.
 const accessible=links.filter(l=>active.has(l.businessId)&&
  l.grants.some(g=>g.clerkUserId===actor.clerkUserId&&
   g.canRead&&!g.revokedAt));
 const [cases,assignments]=await Promise.all([
  accessible.length?db.chessServiceCase.findMany({
   where:{clientProfileId:profile.id,OR:accessible.map(l=>({
    businessId:l.businessId,service:l.service,
   }))},
   select:{id:true,businessId:true,service:true,status:true,
    ownerClerkUserId:true,createdAt:true},
   orderBy:{createdAt:"desc"},take:100,
  }):Promise.resolve([]),
  db.chessEmployeeAssignment.findMany({where:{
   businessId:{in:Array.from(active)},revokedAt:null,
  },select:{businessId:true,clerkUserId:true},take:1000}),
 ]);
 return {profile,businesses,members,viewerId:actor.clerkUserId,
  links:links.filter(l=>active.has(l.businessId)),
  consents:consents.filter(c=>active.has(c.businessId)),
  cases,assignments};
}
