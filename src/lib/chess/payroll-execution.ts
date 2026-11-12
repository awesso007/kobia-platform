import {z} from "zod";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {submitPayrollToProvider} from "./payroll-provider";
import {resolveChessPostedPayrollRun} from "./payroll-source";

const request=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 legacyPayRunId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 approvalId:z.string().min(1).max(128),
}).strict();

/** The requester, administrator reviewer and actual payroll operator must
 * be three separate active human identities. No review is an execution grant. */
export function payrollHasIndependentActors(requester:string,reviewer:string|null,operator:string):boolean{
 return !!requester&&!!reviewer&&!!operator&&
  new Set([requester,reviewer,operator]).size===3;
}

/** Only a different authorized reviewer may approve a specific, posted run.
 * Provider-side employee, bank and tax readiness checks are mandatory. */
export async function executeChessPayroll(input:unknown) {
 const data=request.parse(input);
 const actor=await getCurrentMembership();
 if(!actor || !["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:update");
 if(process.env.CHESS_DEMO_MODE==="true"||
  process.env.CHESS_PAYROLL_PROVIDER_CERTIFIED!=="true"){
  throw new Error("Payroll provider compliance gate disabled.");
 }
 const {db,legacyTenant,run,payload,digest}=await resolveChessPostedPayrollRun({
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  legacyPayRunId:data.legacyPayRunId,serviceCaseId:data.serviceCaseId,
 });
 const approval=await db.chessActionApproval.findFirst({where:{
  id:data.approvalId,businessId:data.businessId,actionType:"PAYROLL_EXECUTE",
  payloadDigest:digest,status:"APPROVED",NOT:{requestedBy:actor.clerkUserId},
  reviewedBy:{not:null},
 }});
 if(!approval || !payrollHasIndependentActors(
  approval.requestedBy,approval.reviewedBy,actor.clerkUserId))
  throw new PermissionError("record:update");
 // Generic, source-blind action approvals from previous releases cannot
 // authorize financial execution. Require BOTH audited, source-bound
 // request and decision provenance tied to the exact approval, actors,
 // business and digest already verified above.
 const [sourceRequest,sourceDecision]=await Promise.all([
  db.chessSecurityEvent.findFirst({where:{
   businessId:data.businessId,actorClerkUserId:approval.requestedBy,
   action:"PAYROLL_SOURCE_APPROVAL_REQUESTED",
   resourceType:"ChessActionApproval",resourceId:approval.id,
   decision:"REVIEW",
  },select:{id:true}}),
  db.chessSecurityEvent.findFirst({where:{
   businessId:data.businessId,
   actorClerkUserId:approval.reviewedBy!,
   action:"PAYROLL_SOURCE_APPROVAL_DECIDED",
   resourceType:"ChessActionApproval",resourceId:approval.id,
   decision:"ALLOW",
  },select:{id:true}}),
 ]);
 if(!sourceRequest||!sourceDecision)
  throw new PermissionError("record:update");

 const [requester,reviewer]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:approval.requestedBy},
   select:{status:true}}),
  db.membership.findUnique({where:{clerkUserId:approval.reviewedBy!},
   select:{status:true,role:true}}),
 ]);
 if(requester?.status!=="ACTIVE" || reviewer?.status!=="ACTIVE" ||
  !["OWNER","ADMIN"].includes(reviewer.role))
  throw new PermissionError("record:update");
 const existing=await db.chessPayrollDispatch.findFirst({
  where:{businessId:data.businessId,legacyPayRunId:run.id},
 });
 // Never transmit the same pay run twice.
 if(existing)return {id:existing.id,status:existing.status};
 const dispatch=await db.chessPayrollDispatch.create({data:{
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  legacyTenantId:legacyTenant.id,legacyEntityId:run.entityId,legacyPayRunId:run.id,
  approvalId:approval.id,idempotencyKey:digest,
 }});
 const claimed=await db.chessPayrollDispatch.updateMany({
  where:{id:dispatch.id,status:"READY"},data:{status:"SUBMITTING"},
 });
 if(claimed.count!==1)throw new Error("Payroll dispatch already claimed.");
 try{
  const remote=await submitPayrollToProvider({...payload,idempotencyKey:digest});
  await db.chessPayrollDispatch.update({
   where:{id:dispatch.id},data:{
    status:remote.status==="rejected"?"REJECTED":"SUBMITTED",
    providerRequestId:remote.id,submittedAt:new Date(),
   },
  });
  await db.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"PAYROLL_PROVIDER_SUBMITTED",resourceType:"ChessPayrollDispatch",
   resourceId:dispatch.id,decision:"REVIEW",
  }});
  return {id:dispatch.id,status:remote.status==="rejected"?"REJECTED":"SUBMITTED"};
 }catch{
  // Unknown remote outcome: never blindly retry a payroll transmission.
  await db.chessPayrollDispatch.updateMany({
   where:{id:dispatch.id,status:"SUBMITTING"},data:{
    status:"UNKNOWN",lastErrorCode:"PROVIDER_OUTCOME_UNKNOWN",
   },
  });
  return {id:dispatch.id,status:"UNKNOWN" as const};
 }
}
