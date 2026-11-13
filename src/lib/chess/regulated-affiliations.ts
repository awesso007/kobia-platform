import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {credentialAllowsAssignment} from "./regulated-services";
import {verifyAffiliationWithProvider} from "./affiliation-provider";

const register=z.object({
 businessId:z.string().min(1).max(128),
 clerkUserId:z.string().min(1).max(128),
 service:z.enum(["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
 jurisdiction:z.string().trim().min(2).max(30),
 practitionerRegistryId:z.string().trim().min(2).max(128),
 firmRegistryId:z.string().trim().min(2).max(128),
}).strict();
const verify=z.object({
 businessId:z.string().min(1).max(128),
 affiliationId:z.string().min(1).max(128),
}).strict();
async function admin(businessId:string){
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");
 return actor;
}
export async function registerChessRegulatedAffiliation(input:unknown){
 const data=register.parse(input);
 const actor=await admin(data.businessId);
 const {db}=getTenantDb();
 const [staff,assignment,credential]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:data.clerkUserId},
   select:{status:true,role:true}}),
  db.chessEmployeeAssignment.findUnique({where:{businessId_clerkUserId:{
   businessId:data.businessId,clerkUserId:data.clerkUserId,
  }},select:{revokedAt:true}}),
  db.chessPractitionerCredential.findFirst({where:{
   businessId:data.businessId,clerkUserId:data.clerkUserId,
   service:data.service,credentialRegistryId:data.practitionerRegistryId,
   jurisdiction:data.jurisdiction,
  },select:{id:true}}),
 ]);
 if(!staff||staff.status!=="ACTIVE"||staff.role==="VIEWER"||
  !assignment||assignment.revokedAt||!credential)
  throw new PermissionError("record:create");
 return db.$transaction(async tx=>{
  const record=await tx.chessRegulatedAffiliation.upsert({where:{
   businessId_clerkUserId_service:{businessId:data.businessId,
    clerkUserId:data.clerkUserId,service:data.service},
  },create:data,update:{jurisdiction:data.jurisdiction,
   practitionerRegistryId:data.practitionerRegistryId,
   firmRegistryId:data.firmRegistryId,status:"UNVERIFIED",
   checkedAt:null,verifiedByClerkUserId:null,sourceUrl:null,expiresAt:null,
  },select:{id:true,service:true,status:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"REGULATED_AFFILIATION_REGISTERED",
   resourceType:"ChessRegulatedAffiliation",resourceId:record.id,decision:"REVIEW",
  }});
  return record;
 });
}
/** This cannot verify licensing by hand. Registry is the sole source of
 * successful status, and the reviewer must be different from the practitioner. */
export async function verifyChessRegulatedAffiliation(input:unknown){
 const data=verify.parse(input);
 const actor=await admin(data.businessId);
 const {db}=getTenantDb();
 const record=await db.chessRegulatedAffiliation.findFirst({where:{
  id:data.affiliationId,businessId:data.businessId,
 }});
 if(!record||record.clerkUserId===actor.clerkUserId)
  throw new PermissionError("record:update");
 const [member,assignment,credential]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:record.clerkUserId},
   select:{status:true}}),
  db.chessEmployeeAssignment.findUnique({where:{businessId_clerkUserId:{
   businessId:data.businessId,clerkUserId:record.clerkUserId,
  }},select:{revokedAt:true}}),
  db.chessPractitionerCredential.findFirst({where:{
   businessId:data.businessId,clerkUserId:record.clerkUserId,
   service:record.service,jurisdiction:record.jurisdiction,
   credentialRegistryId:record.practitionerRegistryId,
  },select:{status:true,expiresAt:true,verifiedAt:true,verifiedByClerkUserId:true,
   verificationSource:true,registryCheckedAt:true}}),
 ]);
 if(member?.status!=="ACTIVE"||!assignment||assignment.revokedAt||
  !credentialAllowsAssignment(credential))
  throw new PermissionError("record:update");
 const evidence=await verifyAffiliationWithProvider({
  practitionerRegistryId:record.practitionerRegistryId,
  firmRegistryId:record.firmRegistryId,service:record.service,
  jurisdiction:record.jurisdiction,
 });
 const valid=!!evidence;
 const now=new Date();
 return db.$transaction(async tx=>{
  const changed=await tx.chessRegulatedAffiliation.updateMany({
   where:{id:record.id,businessId:data.businessId,updatedAt:record.updatedAt},
   data:{status:valid?"VERIFIED":"REJECTED",
    checkedAt:evidence?new Date(evidence.checkedAt):now,
    verifiedByClerkUserId:valid?actor.clerkUserId:null,
    sourceUrl:evidence?.sourceUrl??null,
    expiresAt:evidence?.expiresAt?new Date(evidence.expiresAt):null},
  });
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"REGULATED_AFFILIATION_REGISTRY_CHECK",
   resourceType:"ChessRegulatedAffiliation",resourceId:record.id,
   decision:valid?"ALLOW":"DENY",
  }});
  return {affiliationId:record.id,verified:valid};
 });
}
export async function listChessRegulatedAffiliations(businessId:string){
 await admin(businessId);
 const {db}=getTenantDb();
 return db.chessRegulatedAffiliation.findMany({where:{businessId},
  take:100,orderBy:{updatedAt:"desc"},select:{
   id:true,clerkUserId:true,service:true,status:true,
   jurisdiction:true,firmRegistryId:true,checkedAt:true,expiresAt:true,
  }});
}
