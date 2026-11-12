import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {isUsableConsent} from "./onboarding";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";
import {regulatedCaseAccess,assertRegulatedProfessionalReady} from "./regulated-access";
import {requiredRegulatedChecklist,regulatedIdempotencyKey,
 canReviewRegulatedWorkflow,workflowService} from "./regulated-policy";

const id=z.string().min(1).max(128);
const create=z.object({
 businessId:id,serviceCaseId:id,
 kind:z.enum([
  "MORTGAGE_APPLICATION_COORDINATION","MORTGAGE_DOCUMENT_INTAKE",
  "INSURANCE_COVERAGE_INTAKE","INSURANCE_APPLICATION_COORDINATION",
  "REAL_ESTATE_BUYER_INTAKE","REAL_ESTATE_SELLER_INTAKE",
  "INVESTMENTS_GOAL_DISCOVERY","INVESTMENTS_RISK_DISCOVERY",
 ]),
 requestKey:z.string().regex(/^[a-zA-Z0-9_-]{8,96}$/),
}).strict();
const checklistInput=z.object({
 businessId:id,serviceCaseId:id,workflowId:id,
 itemKey:z.string().regex(/^[A-Z_]{5,80}$/),
 evidenceDocumentId:id.optional(),
}).strict();
const reviewInput=z.object({
 businessId:id,serviceCaseId:id,workflowId:id,
 decision:z.enum(["REVIEW","APPROVED","CLOSED"]),
 expectedUpdatedAt:z.string().datetime(),
}).strict();
const listInput=z.object({businessId:id,serviceCaseId:id}).strict();

/** Only active service cases with explicit service-write grants can create
 * a scoped workflow; requestKey makes repeated user creation idempotent. */
export async function createChessRegulatedWorkflow(value:unknown){
 const data=create.parse(value);
 const access=await regulatedCaseAccess(data.businessId,data.serviceCaseId,{
  active:true,write:true,
 });
 if(workflowService(data.kind)!==access.service)
  throw new PermissionError("record:create");
 const {db,tenantId}=getTenantDb();
 const existing=await db.chessRegulatedWorkflow.findUnique({where:{
  serviceCaseId_requestKey:{serviceCaseId:data.serviceCaseId,requestKey:data.requestKey},
 },select:{id:true,kind:true,status:true}});
 if(existing){
  if(existing.kind!==data.kind)throw new PermissionError("record:create");
  return existing;
 }
 const idempotencyKey=regulatedIdempotencyKey(tenantId,
  data.businessId,data.serviceCaseId,data.requestKey);
 return db.$transaction(async tx=>{
  const record=await tx.chessRegulatedWorkflow.create({data:{
   businessId:data.businessId,clientProfileId:access.record.clientProfileId,
   serviceCaseId:data.serviceCaseId,service:access.record.service,
   kind:data.kind,requestKey:data.requestKey,idempotencyKey,
   createdByClerkUserId:access.actor.clerkUserId,
  },select:{id:true,kind:true,status:true}});
  await tx.chessRegulatedChecklistItem.createMany({data:
   requiredRegulatedChecklist(data.kind).map(itemKey=>({
    workflowId:record.id,itemKey,
   })),
  });
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:access.actor.clerkUserId,
   action:"REGULATED_WORKFLOW_CREATED",
   resourceType:"ChessRegulatedWorkflow",resourceId:record.id,decision:"REVIEW",
  }});
  return record;
 });
}

export async function listChessRegulatedWorkflows(value:unknown){
 const data=listInput.parse(value);
 const access=await regulatedCaseAccess(data.businessId,data.serviceCaseId);
 return auditedChessSensitiveRead(access.db,{
  businessId:data.businessId,actorClerkUserId:access.actor.clerkUserId,
  action:"REGULATED_WORKFLOW_READ",
  resourceType:"ChessServiceCase",resourceId:data.serviceCaseId,
 },async tx=>{
  // Recheck membership, case, service grants and current consent inside
  // the same serializable, audited read as the returned workflow payload.
  const [caseRow,member,link,consents]=await Promise.all([
   tx.chessServiceCase.findFirst({where:{
    id:data.serviceCaseId,businessId:data.businessId,
    clientProfileId:access.record.clientProfileId,
    service:access.record.service,
   },select:{id:true,status:true}}),
   tx.membership.findUnique({where:{clerkUserId:access.actor.clerkUserId},
    select:{status:true}}),
   tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
    profileId:access.record.clientProfileId,businessId:data.businessId,
    service:access.record.service,
   }},select:{grants:{where:{clerkUserId:access.actor.clerkUserId,
    canRead:true,revokedAt:null},select:{id:true}}}}),
   tx.chessClientConsent.findMany({where:{
    businessId:data.businessId,clientProfileId:access.record.clientProfileId,
    purpose:"service:"+access.record.service,
   },select:{status:true,expiresAt:true,consentedAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true,
    acceptanceEvidenceDigest:true,withdrawnAt:true}}),
  ]);
  if(!caseRow||member?.status!=="ACTIVE"||!link?.grants.length||
   !consents.some(c=>isUsableConsent(c)))return null;
  return tx.chessRegulatedWorkflow.findMany({where:{
   businessId:data.businessId,serviceCaseId:data.serviceCaseId,
   clientProfileId:access.record.clientProfileId,service:access.record.service,
  },orderBy:{createdAt:"desc"},take:100,select:{
   id:true,kind:true,status:true,createdAt:true,updatedAt:true,
   checklist:{select:{id:true,itemKey:true,completedAt:true,evidenceDocumentId:true}},
  }});
 });
}

/** Checklist completion is an authenticated human attestation, not automatic
 * proof of regulatory compliance. Optional evidence must be a CLEAN READY
 * immutable version owned by the same client/business/service. */
export async function attestChessRegulatedChecklist(value:unknown){
 const data=checklistInput.parse(value);
 const access=await regulatedCaseAccess(data.businessId,data.serviceCaseId,{
  active:true,write:true,
 });
 const {db}=access;
 const record=await db.chessRegulatedWorkflow.findFirst({where:{
  id:data.workflowId,businessId:data.businessId,serviceCaseId:data.serviceCaseId,
  clientProfileId:access.record.clientProfileId,service:access.record.service,
  status:"DRAFT",
 },select:{id:true,kind:true}});
 if(!record||!requiredRegulatedChecklist(record.kind).includes(data.itemKey))
  throw new PermissionError("record:update");
 if(data.evidenceDocumentId){
  const evidence=await db.chessClientDocument.findFirst({where:{
   id:data.evidenceDocumentId,businessId:data.businessId,
   clientProfileId:access.record.clientProfileId,service:access.record.service,
   status:"READY",storageVersionId:{not:null},checksumSha256:{not:null},
  },select:{id:true}});
  if(!evidence)throw new PermissionError("record:update");
 }
 return db.$transaction(async tx=>{
  // Concurrency fence: only DRAFT may be changed; serialized with review.
  const locked=await tx.chessRegulatedWorkflow.findFirst({where:{
   id:data.workflowId,status:"DRAFT",businessId:data.businessId,
  },select:{id:true}});
  if(!locked)throw new PermissionError("record:update");
  const changed=await tx.chessRegulatedChecklistItem.updateMany({where:{
   workflowId:data.workflowId,itemKey:data.itemKey,completedAt:null,
  },data:{completedAt:new Date(),
   completedByClerkUserId:access.actor.clerkUserId,
   evidenceDocumentId:data.evidenceDocumentId??null,
  }});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:access.actor.clerkUserId,
   action:"REGULATED_CHECKLIST_ATTESTED",
   resourceType:"ChessRegulatedChecklistItem",resourceId:data.workflowId,
   decision:"REVIEW",
  }});
  return {workflowId:record.id,itemKey:data.itemKey,attested:true};
 },{isolationLevel:"Serializable"});
}

/** Review and approval are two separate human decisions after checklist
 * attestations. Approved means authorized to request an opaque partner
 * handoff, not approval of a policy, mortgage, transaction or investment. */
export async function decideChessRegulatedWorkflow(value:unknown){
 const data=reviewInput.parse(value);
 const access=await regulatedCaseAccess(data.businessId,data.serviceCaseId,{
  active:data.decision!=="CLOSED",write:true,
  handoffConsent:data.decision==="APPROVED",
 });
 if(!["OWNER","ADMIN"].includes(access.actor.role))
  throw new PermissionError("record:update");
 const {db}=access;
 const item=await db.chessRegulatedWorkflow.findFirst({where:{
  id:data.workflowId,businessId:data.businessId,
  serviceCaseId:data.serviceCaseId,clientProfileId:access.record.clientProfileId,
  service:access.record.service,
 },include:{checklist:true}});
 if(!item || item.updatedAt.getTime()!==new Date(data.expectedUpdatedAt).getTime())
  throw new PermissionError("record:update");
 if(data.decision==="CLOSED"){
  if(!["DRAFT","REVIEW","APPROVED","REJECTED"].includes(item.status))
   throw new PermissionError("record:update");
 }else{
  if(!canReviewRegulatedWorkflow(item,access.actor.clerkUserId,
   access.actor.role,data.decision))throw new PermissionError("record:update");
  const mandatory=requiredRegulatedChecklist(item.kind);
  if(mandatory.some(key=>!item.checklist.some(c=>c.itemKey===key&&!!c.completedAt)))
   throw new PermissionError("record:update");
  if(data.decision==="APPROVED")await assertRegulatedProfessionalReady(access);
 }
 const timestamp=new Date();
 return db.$transaction(async tx=>{
  const changed=await tx.chessRegulatedWorkflow.updateMany({where:{
   id:item.id,businessId:data.businessId,
   status:item.status,updatedAt:item.updatedAt,
  },data:data.decision==="REVIEW"?{
   status:"REVIEW",reviewedByClerkUserId:access.actor.clerkUserId,
   reviewedAt:timestamp,
  }:data.decision==="APPROVED"?{
   status:"APPROVED",approvedByClerkUserId:access.actor.clerkUserId,
   approvedAt:timestamp,
  }:{status:"CLOSED"}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:access.actor.clerkUserId,
   action:`REGULATED_WORKFLOW_${data.decision}`,
   resourceType:"ChessRegulatedWorkflow",resourceId:item.id,
   decision:data.decision==="CLOSED"?"REVIEW":"ALLOW",
  }});
  return {id:item.id,status:data.decision};
 },{isolationLevel:"Serializable"});
}
