import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";
import * as s3 from "@/lib/storage/s3";
import {matchesPinnedDocument} from "./storage-integrity";

const MAX_SIZE=20*1024*1024;
const types=["application/pdf","image/png","image/jpeg"] as const;
const request=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX","MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
 fileName:z.string().trim().min(1).max(180),
 mimeType:z.enum(types),
 size:z.number().int().min(1).max(MAX_SIZE),
}).strict();

/** Only explicit service grantees may initiate a document upload.
 * S3 must be configured. No production fallback to local disk. */
export async function initiateChessDocumentUpload(input:unknown) {
 const data=request.parse(input);
 const member=await getCurrentMembership();
 if (!member || member.status!=="ACTIVE" || member.role==="VIEWER") throw new PermissionError("record:create");
 const link=await getClientServiceLink(data.clientProfileId,data.businessId,data.service);
 if(!link)throw new PermissionError("record:create");
 const {db:grantDb}=getTenantDb();
 const writeGrant=await grantDb.clientServiceGrant.findFirst({
  where:{linkId:link.id,clerkUserId:member.clerkUserId,canRead:true,canWrite:true,revokedAt:null},
  select:{id:true},
 });
 if(!writeGrant)throw new PermissionError("record:create");
 if(!s3.isConfigured())throw new Error("Private object storage is not configured.");
 const {tenantId,db}=getTenantDb();
 const upload=await s3.createPresignedUploadUrl({
  tenantSlug:tenantId,fileName:`${data.businessId}-${data.fileName}`,
  mimeType:data.mimeType,size:data.size,
 });
 const doc=await db.chessClientDocument.create({
  data:{businessId:data.businessId,clientProfileId:data.clientProfileId,service:data.service,
   fileName:data.fileName,mimeType:data.mimeType,maxBytes:data.size,
   storageKey:upload.storageKey,uploadedByClerkUserId:member.clerkUserId},
  select:{id:true},
 });
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
 const writeGrant=await db.clientServiceGrant.findFirst({
  where:{linkId:link.id,clerkUserId:member.clerkUserId,canRead:true,canWrite:true,revokedAt:null},select:{id:true},
 });
 if(!writeGrant)throw new PermissionError("record:update");
 const doc=await db.chessClientDocument.findFirst({
  where:{id:documentId,businessId,clientProfileId,service,status:"PENDING",uploadedByClerkUserId:member.clerkUserId},
 });
 if(!doc)throw new PermissionError("record:update");
 const head=await s3.headObject(doc.storageKey);
 if(!head || !head.versionId || !head.etag || head.size<1 || head.size>doc.maxBytes || head.mimeType!==doc.mimeType) {
  await db.chessClientDocument.updateMany({where:{id:doc.id,status:"PENDING"},data:{status:"REJECTED"}});
  return {status:"REJECTED" as const};
 }
 await db.chessClientDocument.updateMany({
  where:{id:doc.id,status:"PENDING"},data:{status:"QUARANTINED",actualBytes:head.size,
   storageVersionId:head.versionId,storageETag:head.etag},
 });
 return {status:"QUARANTINED" as const};
}

/** Downloads are available only after a trusted malware scan declares READY.
 * The presigned URL is short-lived and requires an explicit service grant. */
export async function getChessDocumentDownload(
 documentId:string,businessId:string,clientProfileId:string,service:z.infer<typeof request>["service"],
) {
 const member=await getCurrentMembership();
 if(!member || member.status!=="ACTIVE")throw new PermissionError("record:read");
 const link=await getClientServiceLink(clientProfileId,businessId,service);
 if(!link)throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const document=await db.chessClientDocument.findFirst({where:{
  id:documentId,businessId,clientProfileId,service,status:"READY",
 },select:{storageKey:true,storageVersionId:true,storageETag:true,fileName:true,
  actualBytes:true,mimeType:true,maxBytes:true}});
 if(!document || !document.storageVersionId || !document.storageETag)throw new PermissionError("record:read");
 const pinned=await s3.headObject(document.storageKey,document.storageVersionId);
 if(!matchesPinnedDocument(document,pinned))
  throw new PermissionError("record:read");
 const url=await s3.createPresignedDownloadUrl(document.storageKey,{
  expiresIn:60,contentDisposition:"attachment",versionId:document.storageVersionId,
 });
 return {url,expiresInSeconds:60};
}
