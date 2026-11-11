import {createHmac} from "node:crypto";
import {z} from "zod";

const response=z.object({
 eventId:z.string().min(1).max(128),
 digest:z.string().regex(/^[0-9a-f]{64}$/),
 status:z.enum(["archived","pending","rejected","not_found"]),
 receiptId:z.string().min(1).max(200).optional(),
}).strict();
type EventInput={id:string;businessId:string|null;
 actorClerkUserId:string|null;action:string;resourceType:string;
 resourceId:string|null;decision:string;occurredAt:Date};

export function auditArchiveConfigured(){
 if(process.env.CHESS_AUDIT_EXPORT_ENABLED!=="true"||
    process.env.CHESS_SCHEDULER_ENABLED!=="true")return false;
 const token=process.env.CHESS_AUDIT_ARCHIVE_API_KEY;
 const key=process.env.CHESS_AUDIT_HASH_KEY;
 const host=process.env.CHESS_AUDIT_ALLOWED_HOST;
 if(!token||!host||!key||key.length<32)return false;
 return [process.env.CHESS_AUDIT_ARCHIVE_URL,
  process.env.CHESS_AUDIT_STATUS_URL].every(raw=>{
  if(!raw)return false;
  try{
   const url=new URL(raw);
   return url.protocol==="https:"&&url.hostname===host&&
    !url.username&&!url.password&&!url.hash&&!url.port;
  }catch{return false;}
 });
}
function secret(){
 const value=process.env.CHESS_AUDIT_HASH_KEY;
 if(!value||value.length<32)throw new Error("Audit archive signing key disabled.");
 return value;
}
export function auditArchiveEnvelope(tenantSlug:string,event:EventInput){
 // Event labels are safe classification codes, not arbitrary client text.
 // Legacy events with free-form strings stay LOCAL until reviewed.
 const code=/^[A-Za-z][A-Za-z0-9_]{0,119}$/;
 if(!/^[a-z0-9][a-z0-9-]{0,49}$/.test(tenantSlug)||
  !code.test(event.action)||!code.test(event.resourceType)||
  !["ALLOW","DENY","REVIEW","ERROR"].includes(event.decision)||
  !Number.isFinite(event.occurredAt.getTime()))
  throw new Error("Audit metadata contains disallowed export fields.");
 const key=secret();
 const pseudonym=(kind:string,value:string|null)=>
  value?createHmac("sha256",key).update(JSON.stringify({
   tenantSlug,kind,value,
  })).digest("hex"):null;
 const metadata={
  tenantSlug,eventId:event.id,
  occurredAt:event.occurredAt.toISOString(),
  action:event.action,resourceType:event.resourceType,
  decision:event.decision,
  businessTag:pseudonym("BUSINESS",event.businessId),
  actorTag:pseudonym("ACTOR",event.actorClerkUserId),
  resourceTag:pseudonym("RESOURCE",event.resourceId),
 };
 const digest=createHmac("sha256",key).update(JSON.stringify(metadata)).digest("hex");
 return {...metadata,digest};
}
export type AuditEnvelope=ReturnType<typeof auditArchiveEnvelope>;
function exactResponse(value:unknown,envelope:AuditEnvelope){
 const parsed=response.parse(value);
 if(parsed.eventId!==envelope.eventId||parsed.digest!==envelope.digest||
   (parsed.status==="archived"&&!parsed.receiptId))
  throw new Error("Audit archive responded for a different event or hash.");
 return parsed;
}
async function send(url:string,body:unknown,idempotencyKey?:string){
 const raw=await fetch(url,{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{"Authorization":`Bearer ${process.env.CHESS_AUDIT_ARCHIVE_API_KEY!}`,
   "Content-Type":"application/json",
   ...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},
  body:JSON.stringify(body),signal:AbortSignal.timeout(12000),
 });
 if(!raw.ok)throw new Error("Audit archive gateway unavailable.");
 return raw.json() as Promise<unknown>;
}
/** An external append-only vault must validate digest and retain immutable
 * receipt evidence. This function performs NO updates to source audit rows. */
export async function postAuditArchive(envelope:AuditEnvelope){
 if(!auditArchiveConfigured())throw new Error("Audit archive is disabled.");
 const reply=await send(process.env.CHESS_AUDIT_ARCHIVE_URL!,envelope,envelope.digest);
 return exactResponse(reply,envelope);
}
/** An ambiguous POST must be resolved by GET-like status, not replayed. */
export async function checkAuditArchive(envelope:AuditEnvelope){
 if(!auditArchiveConfigured())throw new Error("Audit archive is disabled.");
 const reply=await send(process.env.CHESS_AUDIT_STATUS_URL!,{
  tenantSlug:envelope.tenantSlug,eventId:envelope.eventId,digest:envelope.digest,
 });
 return exactResponse(reply,envelope);
}
