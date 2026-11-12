import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {authorizeChessDocumentService} from "./document-service-authorization";

const base={
 documentId:z.string().min(1).max(128),
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX",
  "MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
};
const action=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("LEGAL_HOLD")}).strict(),
 z.object({...base,action:z.literal("SUPPRESS")}).strict(),
 z.object({...base,action:z.literal("SET_RETENTION"),
  retainUntil:z.string().datetime()}).strict(),
 z.object({...base,action:z.literal("REDACTION_APPROVE")}).strict(),
 z.object({...base,action:z.literal("REQUEST_DELETE")}).strict(),
 z.object({...base,action:z.literal("APPROVE_DELETE")}).strict(),
 z.object({...base,action:z.literal("REJECT_DELETE")}).strict(),
]);

export function documentLifecycleEnabled(env?:{
 CHESS_DOCUMENT_LIFECYCLE_ENABLED?:string;
 CHESS_DOCUMENT_RETENTION_POLICY_APPROVED?:string;
}):boolean{
 const flags=env??{
  CHESS_DOCUMENT_LIFECYCLE_ENABLED:process.env.CHESS_DOCUMENT_LIFECYCLE_ENABLED,
  CHESS_DOCUMENT_RETENTION_POLICY_APPROVED:process.env.CHESS_DOCUMENT_RETENTION_POLICY_APPROVED,
 };
 return flags.CHESS_DOCUMENT_LIFECYCLE_ENABLED==="true"&&
  flags.CHESS_DOCUMENT_RETENTION_POLICY_APPROVED==="true";
}

export function documentPurgeEnabled(env?:{
 CHESS_DOCUMENT_LIFECYCLE_ENABLED?:string;
 CHESS_DOCUMENT_RETENTION_POLICY_APPROVED?:string;
 CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED?:string;
 CHESS_DOCUMENT_PURGE_STORAGE_APPROVED?:string;
}):boolean{
 const flags=env??process.env;
 return flags.CHESS_DOCUMENT_LIFECYCLE_ENABLED==="true"&&
  flags.CHESS_DOCUMENT_RETENTION_POLICY_APPROVED==="true"&&
  flags.CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED==="true"&&
  flags.CHESS_DOCUMENT_PURGE_STORAGE_APPROVED==="true";
}

/** Only an independently approved policy may permit external byte deletion;
 * metadata rows remain tombstones, never deleted from the tenant database.
 * A redaction is a separate scanned immutable derivative, not a PDF overlay. */
export async function updateChessDocumentLifecycle(input:unknown){
 const data=action.parse(input);
 if(!documentLifecycleEnabled())throw new PermissionError("record:update");
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");

 const {db}=getTenantDb();
 const now=new Date();
 const retain=data.action==="SET_RETENTION"?new Date(data.retainUntil):null;
 if(data.action==="SET_RETENTION"&&(!retain||!Number.isFinite(retain.getTime())||
   retain.getTime()<=now.getTime()||
   retain.getTime()>now.getTime()+50*365*86400000))
  throw new RangeError("Retention date outside approved guardrails.");
 const where={id:data.documentId,businessId:data.businessId,
  clientProfileId:data.clientProfileId,service:data.service};
 return db.$transaction(async tx=>{
  // Never authorize a mutation using a stale role/grant from before the
  // transaction. This includes current consent, business and service scope.
  const live=await tx.membership.findUnique({where:{
   clerkUserId:actor.clerkUserId},select:{status:true,role:true}});
  const allowed=await authorizeChessDocumentService(tx,{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   service:data.service,actorClerkUserId:actor.clerkUserId,requireWrite:true,
  });
  if(live?.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(live.role)||
   !allowed)throw new PermissionError("record:update");
  const current=await tx.chessClientDocument.findFirst({where,
   select:{id:true,createdAt:true,status:true,uploadedByClerkUserId:true,
    revisionKind:true,replacesDocumentId:true,checksumSha256:true,
    verifiedAt:true,retentionUntil:true,legalHoldAt:true,supersededAt:true,
    purgedAt:true,suppressedAt:true}});
  if(!current||current.purgedAt)throw new PermissionError("record:update");
  if(retain&&retain<=current.createdAt)throw new PermissionError("record:update");

  if(data.action==="LEGAL_HOLD"||data.action==="SUPPRESS"||
     data.action==="SET_RETENTION"){
   const next=data.action==="LEGAL_HOLD"?{
    legalHoldAt:now,legalHoldByClerkUserId:actor.clerkUserId,
   }:data.action==="SUPPRESS"?{
    suppressedAt:now,suppressedByClerkUserId:actor.clerkUserId,
   }:{retentionUntil:retain!};
   const guard=data.action==="LEGAL_HOLD"?{legalHoldAt:null}:
    data.action==="SUPPRESS"?{suppressedAt:null}:{retentionUntil:null};
   const changed=await tx.chessClientDocument.updateMany({
    where:{...where,...guard,purgedAt:null},data:next,
   });
   if(changed.count!==1)throw new PermissionError("record:update");
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
    action:data.action==="LEGAL_HOLD"?"DOCUMENT_LEGAL_HOLD_SET":
     data.action==="SUPPRESS"?"DOCUMENT_DOWNLOAD_SUPPRESSED":
     "DOCUMENT_RETENTION_SET",
    resourceType:"ChessClientDocument",resourceId:data.documentId,
    decision:"ALLOW",
   }});
   return {updated:true,action:data.action};
  }

  if(data.action==="REDACTION_APPROVE"){
   if(current.revisionKind!=="REDACTED"||current.status!=="QUARANTINED"||
     !current.replacesDocumentId||!current.verifiedAt||
     !current.checksumSha256||
     current.uploadedByClerkUserId===actor.clerkUserId)
    throw new PermissionError("record:update");
   // Publishing a checked, scanned derivative atomically disables the original
   // for all authenticated downloads. The original remains for legal holds.
   const parent=await tx.chessClientDocument.updateMany({where:{
    id:current.replacesDocumentId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,service:data.service,
    status:"READY",supersededAt:null,purgedAt:null,
   },data:{supersededAt:now}});
   if(parent.count!==1)throw new PermissionError("record:update");
   const approved=await tx.chessClientDocument.updateMany({where:{
    ...where,status:"QUARANTINED",redactionApprovedAt:null,purgedAt:null,
   },data:{status:"READY",redactionApprovedAt:now,
    redactionApprovedByClerkUserId:actor.clerkUserId}});
   if(approved.count!==1)throw new PermissionError("record:update");
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
    action:"DOCUMENT_REDACTED_DERIVATIVE_PUBLISHED",
    resourceType:"ChessClientDocument",resourceId:data.documentId,
    decision:"ALLOW",
   }});
   return {updated:true,action:data.action};
  }

  if(data.action==="REQUEST_DELETE"){
   if(current.legalHoldAt)throw new PermissionError("record:update");
   const duplicate=await tx.chessDocumentDisposal.findUnique({
    where:{documentId:data.documentId},select:{id:true}});
   if(duplicate)throw new PermissionError("record:update");
   const queued=await tx.chessDocumentDisposal.create({data:{
    documentId:data.documentId,businessId:data.businessId,
    requestedByClerkUserId:actor.clerkUserId,
   },select:{id:true}});
   // Keep the existing download available until a deliberate SUPPRESS or
   // independently approved PURGE, depending on approved client policy.
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
    action:"DOCUMENT_DISPOSAL_REQUESTED",
    resourceType:"ChessDocumentDisposal",resourceId:queued.id,
    decision:"REVIEW",
   }});
   return {updated:true,action:data.action,disposalId:queued.id};
  }

  const disposal=await tx.chessDocumentDisposal.findUnique({
   where:{documentId:data.documentId},
   select:{id:true,status:true,requestedByClerkUserId:true}});
  if(!disposal||disposal.status!=="REQUESTED"||
   disposal.requestedByClerkUserId===actor.clerkUserId)
   throw new PermissionError("record:update");

  if(data.action==="APPROVE_DELETE"){
   // Missing retention policy metadata never becomes an implicit expiry.
   if(current.legalHoldAt||!current.retentionUntil||
     current.retentionUntil>now||current.purgedAt)
    throw new PermissionError("record:update");
   const changed=await tx.chessDocumentDisposal.updateMany({
    where:{id:disposal.id,status:"REQUESTED",approvedByClerkUserId:null},
    data:{status:"APPROVED",approvedAt:now,
     approvedByClerkUserId:actor.clerkUserId},
   });
   if(changed.count!==1)throw new PermissionError("record:update");
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
    action:"DOCUMENT_DISPOSAL_APPROVED",
    resourceType:"ChessDocumentDisposal",resourceId:disposal.id,
    decision:"REVIEW",
   }});
   return {updated:true,action:data.action,disposalId:disposal.id};
  }
  if(data.action==="REJECT_DELETE"){
   const changed=await tx.chessDocumentDisposal.updateMany({
    where:{id:disposal.id,status:"REQUESTED"},
    data:{status:"REJECTED",lastErrorCode:"INDEPENDENT_REVIEW_DENIED"},
   });
   if(changed.count!==1)throw new PermissionError("record:update");
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
    action:"DOCUMENT_DISPOSAL_REJECTED",
    resourceType:"ChessDocumentDisposal",resourceId:disposal.id,
    decision:"DENY",
   }});
   return {updated:true,action:data.action,disposalId:disposal.id};
  }
  throw new PermissionError("record:update");
 },{isolationLevel:"Serializable"});
}
