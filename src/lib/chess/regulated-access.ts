import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError,getCurrentMembership} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {assertBusinessAccess} from "./business-units";
import {isUsableConsent} from "./onboarding";
import {credentialAllowsAssignment} from "./regulated-services";
import {validAffiliation} from "./regulated-policy";
import type {RegulatedService} from "./regulated-policy";

export function sourceHostApproved(source:string|null,envValue:string|undefined):boolean{
 if(!source||!envValue)return false;
 try{
  const url=new URL(source);
  const allow=envValue.split(",").map(x=>x.trim()).filter(Boolean);
  return url.protocol==="https:"&&!url.username&&!url.password&&
   !url.port&&allow.includes(url.hostname);
 }catch{return false;}
}
export async function regulatedCaseAccess(businessId:string,serviceCaseId:string,
 opts:{write?:boolean;active?:boolean;handoffConsent?:boolean}={}){
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const record=await db.chessServiceCase.findFirst({where:{id:serviceCaseId,businessId},
  select:{id:true,businessId:true,clientProfileId:true,service:true,status:true,
   ownerClerkUserId:true}});
 if(!record||!workflowServiceForService(record.service)||
  (opts.active&&record.status!=="ACTIVE"))
  throw new PermissionError("record:read");
 const granted=await getClientServiceLink(record.clientProfileId,businessId,record.service);
 if(!granted)throw new PermissionError("record:read");
 if(opts.write){
  const link=await db.clientServiceLink.findUnique({where:{
   profileId_businessId_service:{profileId:record.clientProfileId,
    businessId,service:record.service},
  },select:{grants:{where:{clerkUserId:actor.clerkUserId,canRead:true,
    canWrite:true,revokedAt:null},select:{id:true}}}});
  if(!link?.grants.length)throw new PermissionError("record:update");
 }
 const purposes=[`service:${record.service}`,
  ...(opts.handoffConsent?[`external_handoff:${record.service}`]:[])];
 const consents=await db.chessClientConsent.findMany({where:{
  businessId,clientProfileId:record.clientProfileId,purpose:{in:purposes},
 },select:{purpose:true,status:true,expiresAt:true,consentedAt:true,
  acceptedByClerkUserId:true,verifiedEmailDigest:true,
  acceptanceEvidenceDigest:true}});
 if(!purposes.every(p=>consents.some(c=>c.purpose===p&&isUsableConsent(c))))
  throw new PermissionError("record:read");
 return {actor,db,record,service:record.service as RegulatedService};
}
function workflowServiceForService(service:string):service is RegulatedService{
 return ["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"].includes(service);
}
/** Both a recently official-verified individual license and independently
 * verified firm affiliation must be live at the moment of approval/handoff. */
export async function assertRegulatedProfessionalReady(
 access:Awaited<ReturnType<typeof regulatedCaseAccess>>,
 now=new Date(),
){
 const {db,record}=access;
 if(!record.ownerClerkUserId)throw new PermissionError("record:update");
 const subject=record.ownerClerkUserId;
 const [member,assignment,licenses,affiliation]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:subject},select:{status:true}}),
  db.chessEmployeeAssignment.findUnique({where:{businessId_clerkUserId:{
   businessId:record.businessId,clerkUserId:subject,
  }},select:{revokedAt:true}}),
  db.chessPractitionerCredential.findMany({where:{
   businessId:record.businessId,clerkUserId:subject,service:record.service,
  },select:{status:true,expiresAt:true,verifiedAt:true,
   verifiedByClerkUserId:true,verificationSource:true,registryCheckedAt:true,
   credentialRegistryId:true,jurisdiction:true}}),
  db.chessRegulatedAffiliation.findUnique({where:{
   businessId_clerkUserId_service:{businessId:record.businessId,
    clerkUserId:subject,service:record.service},
  },select:{status:true,checkedAt:true,expiresAt:true,
   verifiedByClerkUserId:true,sourceUrl:true,
   practitionerRegistryId:true,jurisdiction:true}}),
 ]);
 if(member?.status!=="ACTIVE"||!assignment||assignment.revokedAt||
  !affiliation||!validAffiliation(affiliation,now)||
  !sourceHostApproved(affiliation.sourceUrl,process.env.CHESS_AFFILIATION_SOURCE_HOSTS))
  throw new PermissionError("record:update");
 const eligible=licenses.some(license=>credentialAllowsAssignment(license,now)&&
  sourceHostApproved(license.verificationSource,process.env.CHESS_LICENSE_SOURCE_HOSTS)&&
  license.credentialRegistryId===affiliation.practitionerRegistryId&&
  license.jurisdiction.toUpperCase()===affiliation.jurisdiction.toUpperCase());
 if(!eligible)throw new PermissionError("record:update");
 return {practitionerClerkUserId:subject};
}
