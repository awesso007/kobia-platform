import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { canReadClientProfile } from "./policy";
import type { ClientService, ProfileActor } from "./policy";
import { z } from "zod";
import { assertBusinessAccess } from "@/lib/chess/business-units";
import {auditedClientServiceRead} from "./service-access-audit";
import {auditedChessSensitiveRead} from "@/lib/chess/sensitive-read-audit";

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
  return auditedChessSensitiveRead(db,{
    actorClerkUserId:actor.clerkUserId,
    action:"CLIENT_PROFILE_DIRECTORY_READ",resourceType:"ClientProfile",
    resourceId:"DIRECTORY",
  },async tx=>{
    const current=await tx.membership.findUnique({
      where:{clerkUserId:actor.clerkUserId},
      select:{status:true,role:true},
    });
    if(current?.status!=="ACTIVE"||current.role==="VIEWER")return null;
    const administrator=["OWNER","ADMIN"].includes(current.role);
    return tx.clientProfile.findMany({
      where:administrator?{}:{ownerClerkUserId:actor.clerkUserId},
      select:{id:true,displayName:true,contactId:true,
       ownerClerkUserId:true,createdAt:true,updatedAt:true},
      orderBy:{displayName:"asc"},take:100,
    });
  });

}

export async function createClientProfile(input: unknown) {
  await requirePermission("record:create");
  const actor = await currentActor();
  const data = createInput.parse(input);
  const { db } = getTenantDb();
  return db.$transaction(async tx=>{
    const current=await tx.membership.findUnique({
      where:{clerkUserId:actor.clerkUserId},select:{status:true,role:true},
    });
    if(current?.status!=="ACTIVE"||current.role==="VIEWER")
      throw new PermissionError("record:create");
    if(data.contactId){
      const contact=await tx.contact.findUnique({
        where:{id:data.contactId},select:{id:true},
      });
      if(!contact)throw new PermissionError("record:create");
    }
    const profile=await tx.clientProfile.create({
      data:{displayName:data.displayName,contactId:data.contactId,
       ownerClerkUserId:actor.clerkUserId},
      select:{id:true,displayName:true,contactId:true,ownerClerkUserId:true,
       createdAt:true,updatedAt:true},
    });
    await tx.chessSecurityEvent.create({data:{
      actorClerkUserId:actor.clerkUserId,action:"CLIENT_PROFILE_CREATED",
      resourceType:"ClientProfile",resourceId:profile.id,decision:"ALLOW",
    }});
    return profile;
  },{isolationLevel:"Serializable"});
}

export async function getClientProfile(profileId: string) {
  await requirePermission("record:read");
  const actor = await currentActor();
  const { db } = getTenantDb();
  return auditedChessSensitiveRead(db,{
    actorClerkUserId:actor.clerkUserId,
    action:"CLIENT_PROFILE_DETAIL_READ",resourceType:"ClientProfile",
    resourceId:idInput.parse(profileId),
  },async tx=>{
    const [member,profile]=await Promise.all([
      tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
        select:{status:true,role:true}}),
      tx.clientProfile.findUnique({
       where:{id:idInput.parse(profileId)},
       select:{id:true,displayName:true,contactId:true,
        ownerClerkUserId:true,createdAt:true,updatedAt:true},
      }),
    ]);
    if(!member||!profile||!canReadClientProfile({
      clerkUserId:actor.clerkUserId,role:member.role,status:member.status,
    },profile.ownerClerkUserId))return null;
    return profile;
  });

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
  // Existing page-level checks are only a preflight. Recheck the tenant
  // admin role, business and profile ownership in the same SERIALIZABLE
  // transaction as the link and its immutable event.
  return db.$transaction(async tx=>{
    const [current,unit,profile]=await Promise.all([
      tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
       select:{status:true,role:true}}),
      tx.chessBusinessUnit.findUnique({where:{id:businessId},
       select:{status:true}}),
      tx.clientProfile.findUnique({where:{id:profileId},select:{id:true}}),
    ]);
    if(current?.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(current.role)||
       unit?.status!=="ACTIVE"||!profile)
      throw new PermissionError("member:manage");
    const link=await tx.clientServiceLink.upsert({
      where:{profileId_businessId_service:{
       profileId:idInput.parse(profileId),businessId:idInput.parse(businessId),
       service:serviceInput.parse(service),
      }},
      create:{profileId,businessId,service},
      update:{},
      select:{id:true,profileId:true,businessId:true,service:true},
    });
    await tx.chessSecurityEvent.create({data:{
      businessId,actorClerkUserId:actor.clerkUserId,
      action:"SERVICE_LINK_PROVISIONED",resourceType:"ClientServiceLink",
      resourceId:link.id,decision:"ALLOW",
    }});
    return link;
  },{isolationLevel:"Serializable"});
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
    const [current,subject,liveLink,unit]=await Promise.all([
      tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
       select:{status:true,role:true}}),
      tx.membership.findUnique({where:{clerkUserId},
       select:{status:true,role:true}}),
      tx.clientServiceLink.findUnique({where:{id:linkId},
       select:{businessId:true}}),
      tx.chessBusinessUnit.findUnique({where:{id:link.businessId},
       select:{status:true}}),
    ]);
    if(current?.status!=="ACTIVE"||
       !["OWNER","ADMIN"].includes(current.role)||
       subject?.status!=="ACTIVE"||subject.role==="VIEWER"||
       liveLink?.businessId!==link.businessId||unit?.status!=="ACTIVE")
      throw new PermissionError("member:manage");
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
  },{isolationLevel:"Serializable"});
}

export async function revokeClientServiceGrant(linkId: string, clerkUserId: string) {
  const actor = await currentActor();
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") throw new PermissionError("member:manage");
  const { db } = getTenantDb();
  const link = await db.clientServiceLink.findUnique({ where: { id: idInput.parse(linkId) }, select: { businessId: true } });
  if (!link) throw new PermissionError("member:manage");
  await assertBusinessAccess(link.businessId);
  return db.$transaction(async tx => {
    const [current,liveLink,unit]=await Promise.all([
      tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
       select:{status:true,role:true}}),
      tx.clientServiceLink.findUnique({where:{id:linkId},
       select:{businessId:true}}),
      tx.chessBusinessUnit.findUnique({where:{id:link.businessId},
       select:{status:true}}),
    ]);
    if(current?.status!=="ACTIVE"||
       !["OWNER","ADMIN"].includes(current.role)||
       liveLink?.businessId!==link.businessId||unit?.status!=="ACTIVE")
      throw new PermissionError("member:manage");
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
  },{isolationLevel:"Serializable"});
}


/** Restricted provisioning metadata, not access to underlying service
 * records or financial/legal documents. All actions are checked again
 * by the existing service-specific mutation APIs. */
export async function getClientProvisioning(profileId:string){
 const actor=await currentActor();
 if(actor.role!=="OWNER"&&actor.role!=="ADMIN")
  throw new PermissionError("member:manage");
 const validatedId=idInput.parse(profileId);
 const {db}=getTenantDb();
 return auditedChessSensitiveRead(db,{
  actorClerkUserId:actor.clerkUserId,action:"CLIENT_PROVISIONING_READ",
  resourceType:"ClientProfile",resourceId:validatedId,
 },async tx=>{
  const [current,profile]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
    select:{status:true,role:true}}),
   tx.clientProfile.findUnique({where:{id:validatedId},
    select:{id:true,displayName:true,contactId:true,
     ownerClerkUserId:true,createdAt:true,updatedAt:true}}),
  ]);
  if(current?.status!=="ACTIVE"||
   !["OWNER","ADMIN"].includes(current.role)||!profile)return null;
  const [businesses,members,links,consents]=await Promise.all([
   tx.chessBusinessUnit.findMany({where:{status:"ACTIVE"},
    select:{id:true,name:true,slug:true},orderBy:{name:"asc"},take:100}),
   tx.membership.findMany({where:{status:"ACTIVE",role:{not:"VIEWER"}},
    select:{clerkUserId:true,displayName:true,role:true},take:100}),
   tx.clientServiceLink.findMany({where:{profileId:profile.id},
    select:{id:true,businessId:true,service:true,
     grants:{select:{id:true,clerkUserId:true,canRead:true,canWrite:true,revokedAt:true}}},
    orderBy:{createdAt:"desc"},take:100}),
   tx.chessClientConsent.findMany({where:{clientProfileId:profile.id},
    select:{id:true,businessId:true,purpose:true,policyVersion:true,status:true,
     createdAt:true,expiresAt:true,consentedAt:true,withdrawnAt:true},
    orderBy:{createdAt:"desc"},take:100}),
  ]);
  const active=new Set(businesses.map(x=>x.id));
  const accessible=links.filter(l=>active.has(l.businessId)&&
   l.grants.some(g=>g.clerkUserId===actor.clerkUserId&&
    g.canRead&&!g.revokedAt));
  // No source-specific service-case record is disclosed without a live,
  // separate case-specific employee grant. Workspace admin alone is NOT
  // a substitute for service-record authorization.
  const [cases,assignments]=await Promise.all([
   accessible.length?tx.chessServiceCase.findMany({
    where:{clientProfileId:profile.id,OR:accessible.map(l=>({
     businessId:l.businessId,service:l.service,
    }))},
    select:{id:true,businessId:true,service:true,status:true,
     ownerClerkUserId:true,createdAt:true},
    orderBy:{createdAt:"desc"},take:100,
   }):Promise.resolve([]),
   tx.chessEmployeeAssignment.findMany({where:{
    businessId:{in:Array.from(active)},revokedAt:null,
   },select:{businessId:true,clerkUserId:true},take:1000}),
  ]);
  return {profile,businesses,members,viewerId:actor.clerkUserId,
   links:links.filter(l=>active.has(l.businessId)),
   consents:consents.filter(c=>active.has(c.businessId)),
   cases,assignments};
 });
}
