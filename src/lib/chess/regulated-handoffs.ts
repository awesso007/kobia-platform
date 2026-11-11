import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {regulatedCaseAccess,assertRegulatedProfessionalReady} from "./regulated-access";
import {requiredRegulatedChecklist} from "./regulated-policy";
import {handoffPartnerId,regulatedHandoffConfigured,
 submitRegulatedHandoff,lookupRegulatedHandoff} from "./regulated-handoff-provider";

const input=z.object({
 businessId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 workflowId:z.string().min(1).max(128),
}).strict();
function requireAdmin(role:string){
 if(role!=="OWNER"&&role!=="ADMIN")throw new PermissionError("record:update");
}
async function requireSignedOffWorkflow(
 access:Awaited<ReturnType<typeof regulatedCaseAccess>>,workflowId:string,
){
 const {db,record}=access;
 const item=await db.chessRegulatedWorkflow.findFirst({where:{
  id:workflowId,businessId:record.businessId,serviceCaseId:record.id,
  clientProfileId:record.clientProfileId,service:record.service,
 },include:{checklist:true}});
 if(!item||!item.approvedAt||!item.reviewedAt||
  !item.reviewedByClerkUserId||!item.approvedByClerkUserId||
  item.createdByClerkUserId===item.reviewedByClerkUserId||
  item.createdByClerkUserId===item.approvedByClerkUserId||
  item.reviewedByClerkUserId===item.approvedByClerkUserId)
  throw new PermissionError("record:update");
 const [reviewer,approver]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:item.reviewedByClerkUserId},
   select:{status:true,role:true}}),
  db.membership.findUnique({where:{clerkUserId:item.approvedByClerkUserId},
   select:{status:true,role:true}}),
 ]);
 if(reviewer?.status!=="ACTIVE"||approver?.status!=="ACTIVE"||
  !["OWNER","ADMIN"].includes(reviewer.role)||
  !["OWNER","ADMIN"].includes(approver.role))
  throw new PermissionError("record:update");
 const checklist=requiredRegulatedChecklist(item.kind);
 if(checklist.some(key=>!item.checklist.some(x=>x.itemKey===key&&!!x.completedAt)))
  throw new PermissionError("record:update");
 const docs=item.checklist.flatMap(x=>x.evidenceDocumentId?[x.evidenceDocumentId]:[]);
 if(docs.length){
  const validDocs=await db.chessClientDocument.count({where:{
   id:{in:docs},businessId:record.businessId,clientProfileId:record.clientProfileId,
   service:record.service,status:"READY",storageVersionId:{not:null},
   checksumSha256:{not:null},
  }});
  if(validDocs!==new Set(docs).size)throw new PermissionError("record:update");
 }
 return item;
}
export function regulatedHandoffStatus(remoteStatus:string):
 "SUBMITTED"|"UNKNOWN"|"REJECTED"{
 return remoteStatus==="accepted"?"SUBMITTED":
  remoteStatus==="rejected"?"REJECTED":"UNKNOWN";
}
export async function submitChessRegulatedHandoff(value:unknown){
 const data=input.parse(value);
 const access=await regulatedCaseAccess(data.businessId,data.serviceCaseId,{
  write:true,active:true,handoffConsent:true,
 });
 requireAdmin(access.actor.role);
 await assertRegulatedProfessionalReady(access);
 const item=await requireSignedOffWorkflow(access,data.workflowId);
 if(item.status!=="APPROVED")throw new PermissionError("record:update");
 if(!regulatedHandoffConfigured(access.service))
  throw new Error("Regulated partner gateway is disabled.");
 const {db,tenantId}=getTenantDb();
 const partnerId=handoffPartnerId(access.service);
 const claim=await db.chessRegulatedWorkflow.updateMany({where:{
  id:item.id,businessId:data.businessId,status:"APPROVED",
  updatedAt:item.updatedAt,
 },data:{status:"SUBMITTING"}});
 if(claim.count!==1)throw new PermissionError("record:update");
 try{
  const response=await submitRegulatedHandoff({
   tenantSlug:tenantId,businessId:data.businessId,
   serviceCaseId:data.serviceCaseId,workflowId:item.id,
   service:access.service,kind:item.kind,
   idempotencyKey:item.idempotencyKey,partnerId,
  });
  // Authorization is checked again after remote acknowledgement. If
  // consent/license/firm evidence changed while in flight, never claim a
  // completed handoff; flag an exception for compliance investigation.
  let stillAuthorized=true;
  try{
   const latest=await regulatedCaseAccess(data.businessId,data.serviceCaseId,{
    write:true,active:true,handoffConsent:true,
   });
   await assertRegulatedProfessionalReady(latest);
  }catch{stillAuthorized=false;}
  const next=stillAuthorized?regulatedHandoffStatus(response.status):"UNKNOWN";
  await db.$transaction(async tx=>{
   const changed=await tx.chessRegulatedWorkflow.updateMany({where:{
    id:item.id,status:"SUBMITTING",
   },data:{status:next,providerRequestId:response.id??null,
    submittedAt:new Date(),
    lastErrorCode:stillAuthorized?
     next==="UNKNOWN"?"PROVIDER_OUTCOME_UNCONFIRMED":null:
     "POST_ACK_AUTHORIZATION_CHANGED"}});
   if(changed.count!==1)throw new Error("Handoff state changed.");
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:access.actor.clerkUserId,
    action:"REGULATED_HANDOFF_RESULT",
    resourceType:"ChessRegulatedWorkflow",resourceId:item.id,
    decision:next==="SUBMITTED"?"ALLOW":"REVIEW",
   }});
  });
  return {id:item.id,status:next,partnerAcknowledged:next==="SUBMITTED",
   regulatedActionExecuted:false};
 }catch{
  // Network may have accepted the ticket even when the local acknowledgement
  // failed. Never automatically submit a second request.
  await db.chessRegulatedWorkflow.updateMany({where:{
   id:item.id,status:"SUBMITTING",
  },data:{status:"UNKNOWN",lastErrorCode:"OUTCOME_UNCONFIRMED"}});
  return {id:item.id,status:"UNKNOWN" as const,
   partnerAcknowledged:false,regulatedActionExecuted:false};
 }
}
/** Read-only reconciliation: lookup by stable key, never replay submissions. */
export async function reconcileChessRegulatedHandoff(value:unknown){
 const data=input.parse(value);
 const access=await regulatedCaseAccess(data.businessId,data.serviceCaseId,{
  write:true,active:true,handoffConsent:true,
 });
 requireAdmin(access.actor.role);
 const {db,tenantId}=getTenantDb();
 const item=await db.chessRegulatedWorkflow.findFirst({where:{
  id:data.workflowId,businessId:data.businessId,
  serviceCaseId:data.serviceCaseId,clientProfileId:access.record.clientProfileId,
  service:access.record.service,status:{in:["SUBMITTED","UNKNOWN","SUBMITTING"]},
 }});
 if(!item)throw new PermissionError("record:update");
 if(item.status==="SUBMITTING"){
  if(Date.now()-item.updatedAt.getTime()<120_000)
   throw new Error("Handoff is still in progress.");
  await db.chessRegulatedWorkflow.updateMany({where:{
   id:item.id,status:"SUBMITTING",updatedAt:item.updatedAt,
  },data:{status:"UNKNOWN",lastErrorCode:"STALE_SUBMITTING_CLAIM"}});
 }
 if(!regulatedHandoffConfigured(access.service))
  throw new Error("Regulated partner gateway is disabled.");
 const remote=await lookupRegulatedHandoff({
  tenantSlug:tenantId,businessId:data.businessId,serviceCaseId:data.serviceCaseId,
  workflowId:item.id,service:access.service,idempotencyKey:item.idempotencyKey,
  providerRequestId:item.providerRequestId,
 });
 let status=regulatedHandoffStatus(remote.status);
 // Provider ack is only trusted while professional and client authorization
 // are still current; do not resubmit when either is missing.
 try{await assertRegulatedProfessionalReady(access);}
 catch{status="UNKNOWN";}
 return db.$transaction(async tx=>{
  const changed=await tx.chessRegulatedWorkflow.updateMany({where:{
   id:item.id,businessId:data.businessId,
   status:{in:["UNKNOWN","SUBMITTED"]},
  },data:{status,providerRequestId:remote.id??item.providerRequestId,
   providerCheckedAt:new Date(),
   lastErrorCode:status==="UNKNOWN"?"RECONCILIATION_UNRESOLVED":null}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:access.actor.clerkUserId,
   action:"REGULATED_HANDOFF_RECONCILED",
   resourceType:"ChessRegulatedWorkflow",resourceId:item.id,
   decision:status==="SUBMITTED"?"ALLOW":"REVIEW",
  }});
  return {id:item.id,status,partnerAcknowledged:status==="SUBMITTED",
   regulatedActionExecuted:false};
 });
}
