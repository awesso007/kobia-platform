import {createHash,timingSafeEqual} from "node:crypto";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import * as s3 from "@/lib/storage/s3";
import {documentPurgeEnabled} from "./document-lifecycle";
import {chessDemoModeActive} from "./demo-mode";

type PurgeDocument={
 status:string;legalHoldAt:Date|null;retentionUntil:Date|null;
 purgedAt:Date|null;storageVersionId:string|null;storageKey:string;
};
export function eligibleForDocumentPurge(doc:PurgeDocument|null,now=new Date()):boolean{
 return !!doc&&!doc.legalHoldAt&&!doc.purgedAt&&!!doc.retentionUntil&&
  doc.retentionUntil<=now&&!!doc.storageVersionId&&
  doc.storageVersionId!=="null"&&doc.storageKey.startsWith("tenants/")&&
  ["READY","REJECTED"].includes(doc.status);
}
export function authorizedDocumentPurgeWorker(token:string):boolean{
 const secret=process.env.CHESS_DOCUMENT_PURGE_WORKER_TOKEN??"";
 if(Buffer.byteLength(secret)<32||token.length!==secret.length)return false;
 return timingSafeEqual(Buffer.from(secret),Buffer.from(token));
}

/** A capped, single-tenant run. No retry of EXECUTING/UNKNOWN: a lost S3
 * response can mean bytes are already gone. Requires independent review
 * and a named, separately approved storage/retention policy at runtime.
 * Each deletion is by S3 VERSION ID and verified through an explicit 404.
 */
export async function runChessDocumentPurge(limit=10){
 if(!documentPurgeEnabled()||!s3.isConfigured()||
    process.env.CHESS_DEMO_MODE==="true"||chessDemoModeActive())
  return {disabled:true,processed:0,purged:0,unknown:0,blocked:0};
 const count=Math.min(Math.max(Math.floor(limit),1),25);
 const {db,tenantId}=getTenantDb();
 const cases=await db.chessDocumentDisposal.findMany({where:{
  status:"APPROVED",
 },select:{id:true},orderBy:{requestedAt:"asc"},take:count});
 let purged=0,unknown=0,blocked=0;
 for(const item of cases){
  const picked=await db.$transaction(async tx=>{
   const claim=await tx.chessDocumentDisposal.findUnique({where:{id:item.id},
    include:{document:true}});
   if(!claim||claim.status!=="APPROVED"||
      !claim.document.storageKey.startsWith("tenants/"+tenantId+"/")||
      !claim.approvedByClerkUserId||
      claim.approvedByClerkUserId===claim.requestedByClerkUserId||
      !eligibleForDocumentPurge(claim.document))return null;
   const changed=await tx.chessDocumentDisposal.updateMany({where:{
    id:item.id,status:"APPROVED",
   },data:{status:"EXECUTING",executionStartedAt:new Date()}});
   if(changed.count!==1)return null;
   await tx.chessSecurityEvent.create({data:{
    businessId:claim.businessId,actorClerkUserId:null,
    action:"DOCUMENT_DISPOSAL_EXECUTING",resourceType:"ChessDocumentDisposal",
    resourceId:claim.id,decision:"REVIEW",
   }});
   return {id:claim.id,documentId:claim.documentId,businessId:claim.businessId,
    storageKey:claim.document.storageKey,versionId:claim.document.storageVersionId!};
  },{isolationLevel:"Serializable"});
  if(!picked){blocked++;continue;}
  try{
   // A signed PUT can create multiple historical versions of the same key.
   // Never delete one and pretend all sensitive bytes are erased.
   const before=await s3.inventoryPinnedStorageVersions(
    picked.storageKey,picked.versionId);
   if(before!=="ONLY_PINNED")throw new Error("Ambiguous object version inventory");
   const result=await s3.deletePinnedObjectVersion(picked.storageKey,picked.versionId);
   const gone=await s3.isPinnedObjectVersionAbsent(picked.storageKey,picked.versionId);
   if(!gone)throw new Error("Pinned object version remains after delete");
   const after=await s3.inventoryPinnedStorageVersions(
    picked.storageKey,picked.versionId);
   if(after!=="NO_CONTENT_VERSIONS")
    throw new Error("Other object content versions remain");
   // Only opaque hashes/IDs are retained, never storage paths or file data.
   const digest=createHash("sha256").update([
    picked.id,picked.documentId,picked.versionId,result.requestId??"none",
    "S3_VERSION_404_CONFIRMED",
   ].join("|")).digest("hex");
   await db.$transaction(async tx=>{
    const checked=await tx.chessClientDocument.findUnique({where:{
     id:picked.documentId},select:{purgedAt:true,legalHoldAt:true,
      storageVersionId:true}});
    if(!checked||checked.purgedAt||checked.legalHoldAt||
       checked.storageVersionId!==picked.versionId)
     throw new Error("Lifecycle changed during object deletion");
    const finished=await tx.chessDocumentDisposal.updateMany({where:{
     id:picked.id,status:"EXECUTING",
    },data:{status:"PURGED",completedAt:new Date(),receiptDigest:digest}});
    if(finished.count!==1)throw new Error("Disposal state changed");
    const marked=await tx.chessClientDocument.updateMany({where:{
     id:picked.documentId,purgedAt:null,legalHoldAt:null,
    },data:{purgedAt:new Date()}});
    if(marked.count!==1)throw new Error("Document disposal changed");
    await tx.chessSecurityEvent.create({data:{
     businessId:picked.businessId,actorClerkUserId:null,
     action:"DOCUMENT_PINNED_VERSION_PURGED",resourceType:"ChessDocumentDisposal",
     resourceId:picked.id,decision:"ALLOW",
    }});
   },{isolationLevel:"Serializable"});
   purged++;
  }catch{
   // The S3 delete might have succeeded. Do not retry deletion automatically.
   // A separate, approved, read-only reconciliation must resolve UNKNOWN.
   await db.$transaction(async tx=>{
    const changed=await tx.chessDocumentDisposal.updateMany({where:{
     id:picked.id,status:"EXECUTING",
    },data:{status:"UNKNOWN",lastErrorCode:"PINNED_DELETE_OUTCOME_UNCONFIRMED"}});
    if(changed.count)await tx.chessSecurityEvent.create({data:{
     businessId:picked.businessId,actorClerkUserId:null,
     action:"DOCUMENT_PURGE_OUTCOME_UNKNOWN",
     resourceType:"ChessDocumentDisposal",resourceId:picked.id,decision:"REVIEW",
    }});
   },{isolationLevel:"Serializable"});
   unknown++;
  }
 }
 return {disabled:false,processed:cases.length,purged,unknown,blocked};
}
