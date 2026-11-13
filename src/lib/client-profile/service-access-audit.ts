import type {PrismaClient} from "@/lib/db/generated/tenant";
import {canAccessService} from "./policy";
import type {ClientService,ProfileActor,ServiceGrant} from "./policy";

/** Security ledger entries intentionally exclude contact names, addresses,
 * document keys and raw service payloads. All actor fields are server-owned. */
export function serviceReadAuditEvent(input:{
 businessId:string;actorClerkUserId:string;linkId:string|null;
 allowed:boolean;
}){
 return {
  businessId:input.businessId,
  actorClerkUserId:input.actorClerkUserId,
  action:"CLIENT_SERVICE_LINK_READ",
  resourceType:"ClientServiceLink",
  ...(input.linkId?{resourceId:input.linkId}:{}),
  decision:input.allowed?"ALLOW" as const:"DENY" as const,
 };
}

type ServiceLinkRead={
 actor:ProfileActor;
 businessId:string;
 profileId:string;
 service:ClientService;
};

/** Authorization and immutable decision evidence commit together.
 * A failed audit write fails the read closed. The NOT_FOUND outcome
 * preserves the previous service API's null return without revealing
 * a guessed client ID in the audit log. */
export async function auditedClientServiceRead(db:PrismaClient,input:ServiceLinkRead){
 return db.$transaction(async tx=>{
  const link=await tx.clientServiceLink.findUnique({
   where:{profileId_businessId_service:{
    profileId:input.profileId,businessId:input.businessId,service:input.service,
   }},
   include:{grants:true},
  });
  const grants:ServiceGrant[]=link?link.grants.map(grant=>({
   clerkUserId:grant.clerkUserId,service:input.service,
   canRead:grant.canRead,canWrite:grant.canWrite,revokedAt:grant.revokedAt,
  })):[];
  const allowed=!!link&&canAccessService(
   input.actor,input.service,grants,"read");
  await tx.chessSecurityEvent.create({
   data:serviceReadAuditEvent({
    businessId:input.businessId,
    actorClerkUserId:input.actor.clerkUserId,
    linkId:link?.id??null,allowed,
   }),
  });
  if(!link)return {status:"NOT_FOUND" as const};
  if(!allowed)return {status:"DENIED" as const};
  return {status:"ALLOWED" as const,
   link:{id:link.id,profileId:link.profileId,
    businessId:link.businessId,service:link.service,
    externalId:link.externalId}};
 });
}
