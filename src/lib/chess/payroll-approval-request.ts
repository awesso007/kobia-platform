import {z} from "zod";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {resolveChessPostedPayrollRun} from "./payroll-source";
import {isUsableConsent} from "./onboarding";

/** Request a REVIEW only. No payroll transmission, wage/employee details or
 * client-supplied amounts/digests are processed here. Explicitly disabled
 * without separately approved internal workflow policy. */
const inputSchema=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 legacyPayRunId:z.string().min(1).max(128),
}).strict();

export function payrollApprovalRequestEnabled(flags:{
 CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED?:string;CHESS_DEMO_MODE?:string;
}):boolean{
 return flags.CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED==="true"&&
  flags.CHESS_DEMO_MODE!=="true";
}
export function payrollApprovalRequesterAllowed(
 role:string,status:string,assignmentRole:string|null,revoked:boolean,
):boolean{
 if(status!=="ACTIVE")return false;
 if(role==="OWNER"||role==="ADMIN")return true;
 return role==="MEMBER"&&!revoked&&
  (assignmentRole==="MANAGER"||assignmentRole==="PRACTITIONER");
}

export async function requestChessPayrollApproval(input:unknown){
 const data=inputSchema.parse(input);
 if(!payrollApprovalRequestEnabled({
  CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED:process.env.CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED,
  CHESS_DEMO_MODE:process.env.CHESS_DEMO_MODE,
 }))throw new PermissionError("record:create");
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:create");
 const {db,run,digest}=await resolveChessPostedPayrollRun(data);
 // The source resolution is cross-database. Re-read all tenant-local
 // authorizations inside the same SERIALIZABLE transaction that stores the
 // requested approval. This narrows (but cannot eliminate) the inter-DB
 // consent and entity-mapping race; live external release still blocked.
 return db.$transaction(async tx=>{
  const [membership,unit,assignment,existing,caseRow,link,consents,mapping,dispatch]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
    select:{role:true,status:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:data.businessId},
    select:{status:true}}),
   tx.chessEmployeeAssignment.findUnique({where:{
    businessId_clerkUserId:{businessId:data.businessId,
     clerkUserId:actor.clerkUserId},
   },select:{role:true,revokedAt:true}}),
   tx.chessActionApproval.findFirst({where:{
    businessId:data.businessId,actionType:"PAYROLL_EXECUTE",
    payloadDigest:digest,
   },select:{id:true,status:true,requestedBy:true}}),
   tx.chessServiceCase.findFirst({where:{
    id:data.serviceCaseId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,service:"PAYROLL",status:"ACTIVE",
   },select:{id:true}}),
   tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
    profileId:data.clientProfileId,businessId:data.businessId,
    service:"PAYROLL",
   }},select:{grants:{where:{
    clerkUserId:actor.clerkUserId,canRead:true,revokedAt:null,
   },select:{id:true}}}}),
   tx.chessClientConsent.findMany({where:{
    businessId:data.businessId,clientProfileId:data.clientProfileId,
    purpose:"service:PAYROLL",
   },select:{status:true,expiresAt:true,consentedAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true,
    acceptanceEvidenceDigest:true,withdrawnAt:true}}),
   tx.chessFinancialLink.findFirst({where:{
    businessId:data.businessId,clientProfileId:data.clientProfileId,
    serviceCaseId:data.serviceCaseId,service:"PAYROLL",
    legacyEntityId:run.entityId,
   },select:{id:true}}),
   tx.chessPayrollDispatch.findFirst({where:{
    businessId:data.businessId,legacyPayRunId:run.id,
   },select:{id:true}}),
  ]);
  if(unit?.status!=="ACTIVE"||!membership||!caseRow||
   !link?.grants.length||!consents.some(x=>isUsableConsent(x))||
   !mapping||dispatch||
   !payrollApprovalRequesterAllowed(membership.role,membership.status,
    assignment?.role??null,!!assignment?.revokedAt))
   throw new PermissionError("record:create");
  if(existing){
   if(existing.requestedBy!==actor.clerkUserId)
    throw new PermissionError("record:create");
   return {id:existing.id,status:existing.status};
  }
  const approval=await tx.chessActionApproval.create({data:{
   businessId:data.businessId,actionType:"PAYROLL_EXECUTE",
   payloadDigest:digest,requestedBy:actor.clerkUserId,
  },select:{id:true,status:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"PAYROLL_SOURCE_APPROVAL_REQUESTED",
   resourceType:"ChessActionApproval",resourceId:approval.id,
   decision:"REVIEW",
  }});
  return approval;
 },{isolationLevel:"Serializable"});
}
