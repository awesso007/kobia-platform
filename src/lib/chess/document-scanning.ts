import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import * as s3 from "@/lib/storage/s3";
import {matchesPinnedDocument} from "./storage-integrity";

const resultSchema=z.object({
 documentId:z.string().min(1).max(128),
 businessId:z.string().min(1).max(128),
 result:z.enum(["CLEAN","INFECTED"]),
 checksumSha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** Verification is an internal machine-to-machine operation.
 * Do not create a public endpoint that accepts an unsigned "clean" flag. */
export function verifyScanSignature(raw:string,timestamp:string,signature:string,tenantSlug:string,now=Date.now()) {
 const key=process.env.CHESS_DOCUMENT_SCAN_KEY;
 if(!key || key.length<32)return false;
 const t=Number(timestamp);
 if(!Number.isSafeInteger(t) || Math.abs(now-t)>300000)return false;
 if(!/^[0-9a-f]{64}$/.test(signature))return false;
 const expected=createHmac("sha256",key).update(tenantSlug+"."+timestamp+"."+raw).digest("hex");
 return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(signature,"hex"));
}

export async function recordDocumentScan(input:unknown) {
 const data=resultSchema.parse(input);
 const {db}=getTenantDb();
 const doc=await db.chessClientDocument.findFirst({where:{
  id:data.documentId,businessId:data.businessId,status:"QUARANTINED",verifiedAt:null,
 }});
 if(!doc)return {updated:false};
 if(!doc.storageVersionId || !doc.storageETag || !doc.actualBytes ||
   doc.actualBytes<1 || doc.actualBytes>20*1024*1024) {
  return db.$transaction(async tx=>{
   const changed=await tx.chessClientDocument.updateMany({
    where:{id:doc.id,businessId:doc.businessId,status:"QUARANTINED",
     verifiedAt:null},
    data:{status:"REJECTED"},
   });
   if(changed.count)await tx.chessSecurityEvent.create({data:{
    businessId:doc.businessId,actorClerkUserId:null,
    action:"DOCUMENT_SCAN_METADATA_REJECTED",
    resourceType:"ChessClientDocument",resourceId:doc.id,decision:"DENY",
   }});
   return {updated:changed.count===1,status:"REJECTED" as const};
  },{isolationLevel:"Serializable"});
 }
 const head=await s3.headObjectStrict(doc.storageKey,doc.storageVersionId);
 const matching=matchesPinnedDocument(doc,head);
 if(!matching)throw new Error("Pinned document does not match scanned metadata.");
 // A valid signed PUT can be replayed while the upload grant remains alive.
 // Refuse CLEAN even for the original pinned version if another content
 // version now exists at this same key; retain quarantine for human repair.
 if(await s3.inventoryPinnedStorageVersions(
   doc.storageKey,doc.storageVersionId)!=="ONLY_PINNED")
  throw new Error("Document object version inventory ambiguous during scan.");
 // A signed callback alone is insufficient: compare against bytes retrieved
 // from the exact immutable object version rather than trusting its digest.
 const stream=await s3.getObjectBody(doc.storageKey,doc.storageVersionId);
 const bytes=Buffer.from(await stream.transformToByteArray());
 const checksum=createHash("sha256").update(bytes).digest("hex");
 const valid=bytes.length===doc.actualBytes && checksum===data.checksumSha256;
 const headAgain=await s3.headObjectStrict(doc.storageKey,doc.storageVersionId);
 if(!headAgain || headAgain.versionId!==doc.storageVersionId ||
   headAgain.etag!==doc.storageETag)throw new Error("Pinned document changed.");
 const clean=valid&&data.result==="CLEAN";
 const next=clean?(doc.revisionKind==="REDACTED"?"QUARANTINED":"READY"):"REJECTED";
 // A redacted derivative stays quarantined after clean scanning until a
 // second, independent owner/admin has reviewed the actual redacted content.
 // Parent supersession and child publication commit in the same transaction.
 return db.$transaction(async tx=>{
  const current=await tx.chessClientDocument.findFirst({where:{
   id:doc.id,businessId:doc.businessId,status:"QUARANTINED",
   verifiedAt:null,storageVersionId:doc.storageVersionId,storageETag:doc.storageETag,
  },select:{id:true,replacesDocumentId:true,revisionKind:true,
   businessId:true,clientProfileId:true,service:true}});
  if(!current)return {updated:false,status:next};
  if(clean&&current.replacesDocumentId&&next==="READY"){
   const parent=await tx.chessClientDocument.updateMany({where:{
    id:current.replacesDocumentId,businessId:current.businessId,
    clientProfileId:current.clientProfileId,service:current.service,
    status:"READY",supersededAt:null,purgedAt:null,
   },data:{supersededAt:new Date()}});
   if(parent.count!==1)throw new Error("Predecessor changed before publication");
  }
  const updated=await tx.chessClientDocument.updateMany({where:{
   id:doc.id,status:"QUARANTINED",verifiedAt:null,
   storageVersionId:doc.storageVersionId,
   storageETag:doc.storageETag,
  },data:{status:next,checksumSha256:checksum,verifiedAt:new Date()}});
  if(updated.count!==1)throw new Error("Scan result is stale");
  await tx.chessSecurityEvent.create({data:{
   businessId:current.businessId,actorClerkUserId:null,
   action:clean&&current.revisionKind==="REDACTED"?
    "DOCUMENT_REDACTION_AWAITING_REVIEW":
    clean?"DOCUMENT_SCAN_PUBLISHED":"DOCUMENT_SCAN_REJECTED",
   resourceType:"ChessClientDocument",resourceId:doc.id,
   decision:clean&&current.revisionKind==="REDACTED"?"REVIEW":
    clean?"ALLOW":"DENY",
  }});
  return {updated:true,status:next,
   reviewRequired:clean&&current.revisionKind==="REDACTED"};
 },{isolationLevel:"Serializable"});
}
