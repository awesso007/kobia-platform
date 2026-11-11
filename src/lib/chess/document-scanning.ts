import {createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import * as s3 from "@/lib/storage/s3";

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
  id:data.documentId,businessId:data.businessId,status:"QUARANTINED",
 }});
 if(!doc)return {updated:false};
 const head=await s3.headObject(doc.storageKey);
 // A missing or altered object must not be released.
 const valid=!!head && head.size===doc.actualBytes && head.mimeType===doc.mimeType &&
  head.size<=doc.maxBytes;
 const updated=await db.chessClientDocument.updateMany({
  where:{id:doc.id,status:"QUARANTINED"},
  data:{status:valid && data.result==="CLEAN"?"READY":"REJECTED",
   checksumSha256:data.checksumSha256,verifiedAt:new Date()},
 });
 return {updated:updated.count===1,status:valid && data.result==="CLEAN"?"READY":"REJECTED"};
}
