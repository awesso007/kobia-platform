import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";
import * as s3 from "@/lib/storage/s3";
import {matchesPinnedDocument} from "./storage-integrity";
import {authorizeChessDocumentService} from "./document-service-authorization";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

export function documentDownloadAllowed(
 doc:{status:string;suppressedAt:Date|null;retentionUntil:Date|null;
  storageVersionId:string|null;storageETag:string|null;
  supersededAt?:Date|null;purgedAt?:Date|null}|null,
 now=new Date(),
):boolean{
 return !!doc&&doc.status==="READY"&&!doc.suppressedAt&&
  !doc.supersededAt&&!doc.purgedAt&&
  !!doc.storageVersionId&&!!doc.storageETag&&
  (!doc.retentionUntil||doc.retentionUntil>now);
}

const MAX_SIZE=20*1024*1024;
const types=["application/pdf","image/png","image/jpeg"] as const;
const request=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX","MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
 fileName:z.string().trim().min(1).max(180),
 mimeType:z.enum(types),
 size:z.number().int().min(1).max(MAX_SIZE),
 revisionKind:z.enum(["REPLACEMENT","REDACTED"]).optional(),
 replacesDocumentId:z.string().min(1).max(128).optional(),
}).strict().refine(data=>Boolean(data.replacesDocumentId)===Boolean(data.revisionKind),{
 message:"Revision kind and predecessor must both be provided.",
});

/** Only explicit service grantees may initiate a document upload.
 * S3 must be configured. No production fallback to local disk. */
export async function initiateChessDocumentUpload(input:unknown) {
 const data=request.parse(input);
 const member=await getCurrentMembership();
 if (!member || member.status!=="ACTIVE" || member.role==="VIEWER") throw new PermissionError("record:create");
 const link=await getClientServiceLink(data.clientProfileId,data.businessId,data.service);
 if(!link)throw new PermissionError("record:create");
 const {db:grantDb}=getTenantDb();
 const permission=await grantDb.$transaction(tx=>authorizeChessDocumentService(tx,{
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  service:data.service,actorClerkUserId:member.clerkUserId,requireWrite:true,
 }),{isolationLevel:"Serializable"});
 if(!permission)throw new PermissionError("record:create");
 if(!s3.isConfigured())throw new Error("Private object storage is not configured.");
 const {tenantId,db}=getTenantDb();
 const upload=await s3.createPresignedUploadUrl({
  tenantSlug:tenantId,fileName:`${data.businessId}-${data.fileName}`,
  mimeType:data.mimeType,size:data.size,
 });
 // A new immutable object version/replacement is created, not an overwrite.
 // The parent and live service authorization are rechecked transactionally.
 const doc=await db.$transaction(async tx=>{
  const live=await authorizeChessDocumentService(tx,{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   service:data.service,actorClerkUserId:member.clerkUserId,requireWrite:true,
  });
  if(!live)throw new PermissionError("record:create");
  const predecessor=data.replacesDocumentId?
   await tx.chessClientDocument.findFirst({where:{
    id:data.replacesDocumentId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,service:data.service,status:"READY",
    supersededAt:null,purgedAt:null,
   },select:{id:true,revisionNumber:true,retentionUntil:true}}):null;
  if(data.replacesDocumentId&&!predecessor)throw new PermissionError("record:create");
  if(predecessor?.retentionUntil&&predecessor.retentionUntil<=new Date())
   throw new PermissionError("record:create");
  const created=await tx.chessClientDocument.create({
   data:{businessId:data.businessId,clientProfileId:data.clientProfileId,
    service:data.service,fileName:data.fileName,mimeType:data.mimeType,
    maxBytes:data.size,storageKey:upload.storageKey,
    uploadedByClerkUserId:member.clerkUserId,
    replacesDocumentId:predecessor?.id??null,
    revisionNumber:predecessor?predecessor.revisionNumber+1:1,
    revisionKind:data.revisionKind??"ORIGINAL",
   },select:{id:true},
  });
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:member.clerkUserId,
   action:predecessor?"DOCUMENT_REVISION_UPLOAD_REQUESTED":"DOCUMENT_UPLOAD_REQUESTED",
   resourceType:"ChessClientDocument",resourceId:created.id,decision:"REVIEW",
  }});
  return created;
 },{isolationLevel:"Serializable"});
 return {documentId:doc.id,uploadUrl:upload.uploadUrl,expiresInSeconds:900};
}

/** S3 HEAD verifies only the object metadata. A malware scanner must explicitly
 * transition QUARANTINED to READY. Never expose a public download URL here. */
export async function confirmChessDocumentUpload(documentId:string,businessId:string,clientProfileId:string,service:z.infer<typeof request>["service"]) {
 const member=await getCurrentMembership();
 if(!member || member.status!=="ACTIVE")throw new PermissionError("record:update");
 const link=await getClientServiceLink(clientProfileId,businessId,service);
 if(!link)throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const permission=await db.$transaction(tx=>authorizeChessDocumentService(tx,{
  businessId,clientProfileId,service,actorClerkUserId:member.clerkUserId,
  requireWrite:true,
 }),{isolationLevel:"Serializable"});
 if(!permission)throw new PermissionError("record:update");
 const doc=await db.chessClientDocument.findFirst({
  where:{id:documentId,businessId,clientProfileId,service,status:"PENDING",uploadedByClerkUserId:member.clerkUserId},
 });
 if(!doc)throw new PermissionError("record:update");
 const head=await s3.headObject(doc.storageKey);
 if(!head || !head.versionId || head.versionId==="null" || !head.etag || head.size<1 || head.size>doc.maxBytes || head.mimeType!==doc.mimeType) {
  await db.chessClientDocument.updateMany({where:{id:doc.id,status:"PENDING"},data:{status:"REJECTED"}});
  return {status:"REJECTED" as const};
 }
 await db.chessClientDocument.updateMany({
  where:{id:doc.id,status:"PENDING"},data:{status:"QUARANTINED",actualBytes:head.size,
   storageVersionId:head.versionId,storageETag:head.etag},
 });
 return {status:"QUARANTINED" as const};
}

async function authorizedChessDocumentDownload(
 documentId:string,businessId:string,clientProfileId:string,
 service:z.infer<typeof request>["service"],
 auditAction:"DOCUMENT_DOWNLOAD_ROUTE_ISSUED"|"DOCUMENT_DOWNLOAD_READ",
){
 const member=await getCurrentMembership();
 if(!member || member.status!=="ACTIVE")throw new PermissionError("record:read");
 const link=await getClientServiceLink(clientProfileId,businessId,service);
 if(!link)throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const document=await db.chessClientDocument.findFirst({where:{
  id:documentId,businessId,clientProfileId,service,status:"READY",
 },select:{storageKey:true,storageVersionId:true,storageETag:true,fileName:true,
  actualBytes:true,mimeType:true,maxBytes:true,status:true,
  suppressedAt:true,retentionUntil:true,supersededAt:true,purgedAt:true}});
 if(!document || !document.storageVersionId || !document.storageETag ||
  !documentDownloadAllowed(document))
  throw new PermissionError("record:read");
 const pinned=await s3.headObject(document.storageKey,document.storageVersionId);
 if(!matchesPinnedDocument(document,pinned))
  throw new PermissionError("record:read");

 // Authorization, latest consent, suppression and pinned-version metadata
 // are checked in the same SERIALIZABLE transaction as the audit event.
 await auditedChessSensitiveRead(db,{
  businessId,actorClerkUserId:member.clerkUserId,
  action:auditAction,resourceType:"ChessClientDocument",resourceId:documentId,
 },async tx=>{
  const authorized=await authorizeChessDocumentService(tx,{
   businessId,clientProfileId,service,actorClerkUserId:member.clerkUserId,
  });
  if(!authorized)return null;
  const latest=await tx.chessClientDocument.findFirst({where:{
   id:documentId,businessId,clientProfileId,service,status:"READY",
  },select:{status:true,suppressedAt:true,retentionUntil:true,
   supersededAt:true,purgedAt:true,storageVersionId:true,storageETag:true}});
  return documentDownloadAllowed(latest)&&
   latest?.storageVersionId===document.storageVersionId&&
   latest.storageETag===document.storageETag?true:null;
 });
 return {document,member};
}

/** The returned URL is an authenticated application route, never a bearer S3 URL. */
export function chessDocumentDownloadPath(
 documentId:string,businessId:string,clientProfileId:string,
 service:z.infer<typeof request>["service"],
):string{
 const query=new URLSearchParams({businessId,clientProfileId,service});
 return "/api/chess/documents/" + encodeURIComponent(documentId) + "/download?" + query.toString();
}

/** Returns a same-origin route. The actual bytes are streamed only after the
 * proxy repeats membership, grant, consent, retention and pinned-version checks. */
export async function getChessDocumentDownload(
 documentId:string,businessId:string,clientProfileId:string,
 service:z.infer<typeof request>["service"],
){
 await authorizedChessDocumentDownload(
  documentId,businessId,clientProfileId,service,"DOCUMENT_DOWNLOAD_ROUTE_ISSUED");
 return {url:chessDocumentDownloadPath(documentId,businessId,clientProfileId,service),
  downloadMode:"authenticated-proxy",expiresInSeconds:null};
}

/** Reauthorize every download request and stream the exact pinned S3 version.
 * Previously issued presigned URLs are no longer created by this code path. */
export async function streamChessDocumentDownload(
 documentId:string,businessId:string,clientProfileId:string,
 service:z.infer<typeof request>["service"],
){
 const {document}=await authorizedChessDocumentDownload(
  documentId,businessId,clientProfileId,service,"DOCUMENT_DOWNLOAD_READ");
 const body=await s3.getObjectBody(document.storageKey,document.storageVersionId!);
 return {
  stream:body.transformToWebStream(),
  fileName:document.fileName,
  mimeType:document.mimeType,
  actualBytes:document.actualBytes,
 };
}

export function safeChessAttachmentDisposition(fileName:string):string{
 const ascii=fileName.replace(/[\r\n"\\]/g,"_").replace(/[^\x20-\x7e]/g,"_")||"download";
 const encoded=encodeURIComponent(fileName).replace(/[!'()*]/g,
  char=>"%"+char.charCodeAt(0).toString(16).toUpperCase());
 return "attachment; filename=\"" + ascii + "\"; filename*=UTF-8''" + encoded;
}


/** Employee-facing document inventory is scoped to a currently readable
 * service link. Never return S3 keys, raw bytes or presigned URLs in lists. */
export async function listChessServiceDocuments(
 businessId:string,clientProfileId:string,service:z.infer<typeof request>["service"],
){
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||actor.role==="VIEWER")
  throw new PermissionError("record:read");
 const link=await getClientServiceLink(clientProfileId,businessId,service);
 if(!link)throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return auditedChessSensitiveRead(db,{
  businessId,actorClerkUserId:actor.clerkUserId,
  action:"DOCUMENT_LIST_READ",resourceType:"ChessClientDocument",
  resourceId:"service:"+service+":"+clientProfileId,
 },async tx=>{
  const authorization=await authorizeChessDocumentService(tx,{
   businessId,clientProfileId,service,actorClerkUserId:actor.clerkUserId,
  });
  if(!authorization)return null;
  const records=await tx.chessClientDocument.findMany({
   where:{businessId,clientProfileId,service},
   select:{id:true,fileName:true,mimeType:true,status:true,
    actualBytes:true,createdAt:true,verifiedAt:true,
    retentionUntil:true,legalHoldAt:true,suppressedAt:true,
    revisionNumber:true,revisionKind:true,replacesDocumentId:true,
    redactionApprovedAt:true,supersededAt:true,purgedAt:true},
   orderBy:{createdAt:"desc"},take:100,
  });
  return {canUpload:authorization.canWrite,records};
 });
}
