import {createHash} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {chessDemoModeActive} from "./demo-mode";
import {documentPurgeEnabled} from "./document-lifecycle";
import {eligibleForDocumentPurge} from "./document-purge";
import * as s3 from "@/lib/storage/s3";

const inputSchema=z.object({
 businessId:z.string().min(1).max(128),
 disposalId:z.string().min(1).max(128),
}).strict();

export function independentDisposalResolver(input:{
 requester:string;approver:string|null;resolver:string;
 status:string;approvedAt:Date|null;
}):boolean{
 return input.status==="UNKNOWN"&&!!input.approvedAt&&!!input.approver&&
  new Set([input.requester,input.approver,input.resolver]).size===3;
}

/** Read-only reconciliation of an ambiguous S3 delete. This function NEVER
 * sends DeleteObject, reissues a purge or treats an access-denied/timeout as
 * 404. It may pin a receipt only after exact-VersionId HEAD explicitly
 * returns 404 and a different owner/admin confirms scope and retention.
 * A version-specific 404 does not prove backups or replicas were erased.
 */
export async function reconcileChessUnknownDocumentDisposal(input:unknown){
 const data=inputSchema.parse(input);
 if(!documentPurgeEnabled()||!s3.isConfigured()||
    process.env.CHESS_DEMO_MODE==="true"||chessDemoModeActive())
  throw new PermissionError("record:update");
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||
   !["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const row=await db.chessDocumentDisposal.findFirst({where:{
  id:data.disposalId,businessId:data.businessId,status:"UNKNOWN",
 },include:{document:true}});
 if(!row||!independentDisposalResolver({
  requester:row.requestedByClerkUserId,
  approver:row.approvedByClerkUserId,
  resolver:actor.clerkUserId,
  status:row.status,approvedAt:row.approvedAt,
 })||!eligibleForDocumentPurge(row.document))
  throw new PermissionError("record:update");

 // Unknown response MUST remain UNKNOWN. There is deliberately no branch
 // that reissues DeleteObject when the pinned version still exists.
 const absent=await s3.isPinnedObjectVersionAbsent(
  row.document.storageKey,row.document.storageVersionId!);
 if(!absent)return {status:"UNKNOWN" as const,
  versionAbsent:false,automaticallyRetried:false};

 return db.$transaction(async tx=>{
  const [member,unit,latest]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
    select:{role:true,status:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:data.businessId},
    select:{status:true}}),
   tx.chessDocumentDisposal.findFirst({where:{
    id:data.disposalId,businessId:data.businessId,status:"UNKNOWN",
   },include:{document:true}}),
  ]);
  if(member?.status!=="ACTIVE"||
    !["OWNER","ADMIN"].includes(member.role)||
    unit?.status!=="ACTIVE"||!latest||
    !independentDisposalResolver({
     requester:latest.requestedByClerkUserId,
     approver:latest.approvedByClerkUserId,
     resolver:actor.clerkUserId,
     status:latest.status,approvedAt:latest.approvedAt,
    })||!eligibleForDocumentPurge(latest.document)||
    latest.document.storageVersionId!==row.document.storageVersionId||
    latest.document.storageKey!==row.document.storageKey||
    latest.document.id!==row.document.id)
   throw new PermissionError("record:update");
  const now=new Date();
  const receiptDigest=createHash("sha256").update(JSON.stringify({
   disposalId:latest.id,documentId:latest.documentId,
   versionId:latest.document.storageVersionId,
   evidence:"S3_VERSION_HEAD_EXPLICIT_404",reviewer:actor.clerkUserId,
  })).digest("hex");
  const finished=await tx.chessDocumentDisposal.updateMany({where:{
   id:latest.id,businessId:data.businessId,status:"UNKNOWN",
  },data:{status:"PURGED",completedAt:now,receiptDigest,lastErrorCode:null}});
  if(finished.count!==1)throw new PermissionError("record:update");
  const tombstone=await tx.chessClientDocument.updateMany({where:{
   id:latest.documentId,businessId:data.businessId,purgedAt:null,
   legalHoldAt:null,storageVersionId:row.document.storageVersionId,
  },data:{purgedAt:now}});
  if(tombstone.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"DOCUMENT_UNKNOWN_VERSION_ABSENCE_CONFIRMED",
   resourceType:"ChessDocumentDisposal",resourceId:latest.id,decision:"ALLOW",
  }});
  return {status:"PURGED" as const,versionAbsent:true,
   automaticallyRetried:false};
 },{isolationLevel:"Serializable"});
}
