import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";
import * as s3 from "@/lib/storage/s3";
import {randomUUID} from "node:crypto";

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
 if(!s3.isConfigured())throw new Error("Private object storage is not configured.");
 const {tenantId,db}=getTenantDb();
 const storageKey=s3.buildStorageKey(tenantId,`${data.businessId}-${randomUUID()}-${data.fileName}`);
 const doc=await db.chessClientDocument.create({
  data:{businessId:data.businessId,clientProfileId:data.clientProfileId,service:data.service,
   fileName:data.fileName,mimeType:data.mimeType,maxBytes:data.size,
   storageKey,uploadedByClerkUserId:member.clerkUserId},
  select:{id:true},
 });
 // URL is signed for exactly this key and content type; verification is required
 // after upload, before even considering release from quarantine.
 const upload=await s3.createPresignedUploadUrl({
  tenantSlug:tenantId,fileName:`${doc.id}-${data.fileName}`,
  mimeType:data.mimeType,size:data.size,
 });
 // Prevent key mismatch: signed key must be the key stored in metadata.
 // The s3 helper constructs a random key, so use the actual signed key instead.
 await db.chessClientDocument.update({where:{id:doc.id},data:{storageKey:upload.storageKey}});
 return {documentId:doc.id,uploadUrl:upload.uploadUrl,expiresInSeconds:900};
}

/** S3 HEAD verifies only the object metadata. A malware scanner must explicitly
 * transition QUARANTINED to READY. Never expose a public download URL here. */
export async function confirmChessDocumentUpload(documentId:string,businessId:string,clientProfileId:string,service:typeof request.shape.service._type) {
 const member=await getCurrentMembership();
 if(!member || member.status!=="ACTIVE")throw new PermissionError("record:update");
 await getClientServiceLink(clientProfileId,businessId,service);
 const {db}=getTenantDb();
 const doc=await db.chessClientDocument.findFirst({
  where:{id:documentId,businessId,clientProfileId,service,status:"PENDING",uploadedByClerkUserId:member.clerkUserId},
 });
 if(!doc)throw new PermissionError("record:update");
 const head=await s3.headObject(doc.storageKey);
 if(!head || head.size<1 || head.size>doc.maxBytes || head.mimeType!==doc.mimeType) {
  await db.chessClientDocument.updateMany({where:{id:doc.id,status:"PENDING"},data:{status:"REJECTED"}});
  return {status:"REJECTED" as const};
 }
 await db.chessClientDocument.updateMany({
  where:{id:doc.id,status:"PENDING"},data:{status:"QUARANTINED",actualBytes:head.size},
 });
 return {status:"QUARANTINED" as const};
}
