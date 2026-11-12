import {z} from "zod";
import {db as legacyDb} from "@/lib/db";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {payrollFingerprint,submitPayrollToProvider} from "./payroll-provider";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {isUsableConsent} from "./onboarding";

const request=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 legacyPayRunId:z.string().min(1).max(128),
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
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if(!actor || !["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:update");
 if(process.env.CHESS_PAYROLL_PROVIDER_CERTIFIED!=="true"){
  throw new Error("Payroll provider compliance gate disabled.");
 }
 const grant=await getClientServiceLink(data.clientProfileId,data.businessId,"PAYROLL");
 if(!grant)throw new PermissionError("record:update");
 const {db,tenantId}=getTenantDb();
 const [serviceCases,consents]=await Promise.all([
  db.chessServiceCase.findMany({where:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   service:"PAYROLL",status:"ACTIVE",
  },select:{id:true}}),
  db.chessClientConsent.findMany({where:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   purpose:"service:PAYROLL",
  },select:{status:true,expiresAt:true,consentedAt:true,
   acceptedByClerkUserId:true,verifiedEmailDigest:true,
   acceptanceEvidenceDigest:true}}),
 ]);
 if(!consents.some(x=>isUsableConsent(x)))throw new PermissionError("record:update");
 const legacyTenant=await getTenantBySlug(tenantId);
 if(!legacyTenant)throw new PermissionError("record:update");
 const mapping=await db.chessFinancialLink.findFirst({
  where:{businessId:data.businessId,clientProfileId:data.clientProfileId,
   service:"PAYROLL",legacyTenantId:legacyTenant.id},
 });
 if(!mapping||!serviceCases.some(x=>x.id===mapping.serviceCaseId))
  throw new PermissionError("record:update");
 const run=await legacyDb.payRun.findFirst({
  where:{id:data.legacyPayRunId,entityId:mapping.legacyEntityId,
   tenantId:legacyTenant.id,status:"POSTED"},
  select:{id:true,tenantId:true,entityId:true,payDate:true,totalGrossCents:true,
   totalNetCents:true,totalTaxesCents:true},
 });
 if(!run || run.totalGrossCents<=0n || run.totalNetCents<0n || run.totalTaxesCents<0n ||
  run.totalNetCents+run.totalTaxesCents>run.totalGrossCents){
  throw new PermissionError("record:update");
 }
 const payload={
  tenantId:run.tenantId,entityId:run.entityId,payRunId:run.id,
  grossCents:run.totalGrossCents.toString(),
  netCents:run.totalNetCents.toString(),
  taxCents:run.totalTaxesCents.toString(),payDate:run.payDate.toISOString(),
 };
 const digest=payrollFingerprint(payload);
 const approval=await db.chessActionApproval.findFirst({where:{
  id:data.approvalId,businessId:data.businessId,actionType:"PAYROLL_EXECUTE",
  payloadDigest:digest,status:"APPROVED",NOT:{requestedBy:actor.clerkUserId},
  reviewedBy:{not:null},
 }});
 if(!approval || !payrollHasIndependentActors(
  approval.requestedBy,approval.reviewedBy,actor.clerkUserId))
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
