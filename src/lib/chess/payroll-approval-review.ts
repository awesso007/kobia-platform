import {z} from "zod";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {resolveChessPostedPayrollRun} from "./payroll-source";
import {isUsableConsent} from "./onboarding";
import {payrollApprovalRequesterAllowed} from "./payroll-approval-request";

const sourceSchema=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 legacyPayRunId:z.string().min(1).max(128),
}).strict();
const decisionSchema=sourceSchema.extend({
 approvalId:z.string().min(1).max(128),
 decision:z.enum(["APPROVED","REJECTED"]),
}).strict();

export function canReviewBoundPayrollApproval(input:{
 actorId:string;actorRole:string;actorStatus:string;requestedBy:string;
 status:string;actionType:string;actualDigest:string;expectedDigest:string;
}):boolean{
 return input.actorStatus==="ACTIVE"&&
  ["OWNER","ADMIN"].includes(input.actorRole)&&
  input.requestedBy!==input.actorId&&
  input.status==="PENDING"&&input.actionType==="PAYROLL_EXECUTE"&&
  input.actualDigest===input.expectedDigest&&
  /^[a-f0-9]{64}$/.test(input.actualDigest);
}

/** Explicit run-specific inspection; NO individual wages or bank details
 * are returned. The reviewer must independently locate the exact case,
 * active consent, and POSTED legacy run before deciding. */
export async function listChessPayrollApprovalEvidence(input:unknown){
 const data=sourceSchema.parse(input);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:read");
 const {db,run,digest}=await resolveChessPostedPayrollRun(data);
 return db.$transaction(async tx=>{
  const [membership,approvals]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
    select:{status:true,role:true}}),
   tx.chessActionApproval.findMany({where:{
    businessId:data.businessId,actionType:"PAYROLL_EXECUTE",
    payloadDigest:digest,
   },select:{id:true,status:true,requestedBy:true,reviewedBy:true,
    createdAt:true,reviewedAt:true},
   orderBy:{createdAt:"desc"},take:25}),
  ]);
  if(membership?.status!=="ACTIVE"||
   !["OWNER","ADMIN"].includes(membership.role))
   throw new PermissionError("record:read");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"PAYROLL_APPROVAL_EVIDENCE_READ",
   resourceType:"ChessServiceCase",resourceId:data.serviceCaseId,
   decision:"REVIEW",
  }});
  return {
   source:{legacyPayRunId:run.id,payDate:run.payDate.toISOString(),
    grossCents:run.totalGrossCents.toString(),
    netCents:run.totalNetCents.toString(),
    taxCents:run.totalTaxesCents.toString()},
   approvals:approvals.map(a=>({
    id:a.id,status:a.status,requestedBy:a.requestedBy,
    createdAt:a.createdAt.toISOString(),
    reviewedAt:a.reviewedAt?.toISOString()??null,
    canReview:canReviewBoundPayrollApproval({
     actorId:actor.clerkUserId,actorRole:membership.role,
     actorStatus:membership.status,requestedBy:a.requestedBy,
     status:a.status,actionType:"PAYROLL_EXECUTE",
     actualDigest:digest,expectedDigest:digest,
    }),
   })),
  };
 },{isolationLevel:"Serializable"});
}

/** Only a current independent administrator can decide. The digest MUST
 * match the source's current posted amounts, entity and pay date.
 * A generic approval PATCH can never approve PAYROLL_EXECUTE. */
export async function reviewChessPayrollSourceApproval(input:unknown){
 const data=decisionSchema.parse(input);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");
 const {db,digest,run}=await resolveChessPostedPayrollRun(data);
 return db.$transaction(async tx=>{
  const [membership,approval,business,caseRow,link,consents,dispatch]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
    select:{role:true,status:true}}),
   tx.chessActionApproval.findFirst({where:{
    id:data.approvalId,businessId:data.businessId,
   },select:{requestedBy:true,status:true,actionType:true,payloadDigest:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:data.businessId},select:{status:true}}),
   tx.chessServiceCase.findFirst({where:{
    id:data.serviceCaseId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,service:"PAYROLL",status:"ACTIVE",
   },select:{id:true}}),
   tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
    profileId:data.clientProfileId,businessId:data.businessId,service:"PAYROLL",
   }},select:{grants:{where:{
    clerkUserId:actor.clerkUserId,canRead:true,revokedAt:null,
   },select:{id:true}}}}),
   tx.chessClientConsent.findMany({where:{
    businessId:data.businessId,clientProfileId:data.clientProfileId,
    purpose:"service:PAYROLL",
   },select:{status:true,expiresAt:true,consentedAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true,
    acceptanceEvidenceDigest:true}}),
   tx.chessPayrollDispatch.findFirst({where:{
    businessId:data.businessId,legacyPayRunId:run.id,
   },select:{id:true}}),
  ]);
  if(!approval||!membership||business?.status!=="ACTIVE"||
   !caseRow||!link?.grants.length||!consents.some(isUsableConsent)||dispatch||
   !canReviewBoundPayrollApproval({
    actorId:actor.clerkUserId,actorRole:membership.role,
    actorStatus:membership.status,requestedBy:approval.requestedBy,
    status:approval.status,actionType:approval.actionType,
    actualDigest:approval.payloadDigest,expectedDigest:digest,
   }))throw new PermissionError("record:update");
  const [requester,assignment]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:approval.requestedBy},
    select:{role:true,status:true}}),
   tx.chessEmployeeAssignment.findUnique({where:{
    businessId_clerkUserId:{businessId:data.businessId,
     clerkUserId:approval.requestedBy},
   },select:{role:true,revokedAt:true}}),
  ]);
  if(!requester||!payrollApprovalRequesterAllowed(
   requester.role,requester.status,
   assignment?.role??null,!!assignment?.revokedAt,
  ))throw new PermissionError("record:update");
  const changed=await tx.chessActionApproval.updateMany({where:{
   id:data.approvalId,businessId:data.businessId,
   status:"PENDING",payloadDigest:digest,
  },data:{status:data.decision,reviewedBy:actor.clerkUserId,
   reviewedAt:new Date()}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"PAYROLL_SOURCE_APPROVAL_DECIDED",
   resourceType:"ChessActionApproval",resourceId:data.approvalId,
   decision:data.decision==="APPROVED"?"ALLOW":"DENY",
  }});
  return {id:data.approvalId,status:data.decision};
 },{isolationLevel:"Serializable"});
}
