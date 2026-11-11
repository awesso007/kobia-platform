// Manual-only fictional event archive contract check. No production DB,
// clients, employees or regulated records are accessed.
import {createHmac,randomUUID} from "node:crypto";
function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" must be set in protected sandbox");
 return value;
}
function approvedUrl(raw,host){
 const url=new URL(raw);
 if(url.protocol!=="https:"||url.hostname!==host||
  url.username||url.password||url.hash||url.port)
  throw new Error("Audit sandbox URL must match the approved HTTPS host");
 return url.toString();
}
if(process.env.CHESS_AUDIT_SANDBOX_VALIDATE!=="true"||
 process.env.CHESS_AUDIT_SANDBOX_ISOLATED!=="true")
 throw new Error("Explicit isolated audit archive sandbox consent required.");
const key=required("CHESS_AUDIT_HASH_KEY");
if(key.length<32)throw new Error("Audit HMAC secret is too short.");
const tenantSlug=required("CHESS_AUDIT_SANDBOX_TENANT");
if(!/^[a-z0-9][a-z0-9-]{0,49}$/.test(tenantSlug))
 throw new Error("Invalid fictional tenant ID");
const eventId="sandbox-"+randomUUID();
const metadata={
 tenantSlug,eventId,occurredAt:new Date().toISOString(),
 action:"TEST_AUDIT_ARCHIVE",resourceType:"SANDBOX",decision:"REVIEW",
 businessTag:null,actorTag:null,resourceTag:null,
};
const digest=createHmac("sha256",key).update(JSON.stringify(metadata)).digest("hex");
const envelope={...metadata,digest};
const host=required("CHESS_AUDIT_ALLOWED_HOST");
const createUrl=approvedUrl(required("CHESS_AUDIT_ARCHIVE_URL"),host);
const statusUrl=approvedUrl(required("CHESS_AUDIT_STATUS_URL"),host);
const token=required("CHESS_AUDIT_ARCHIVE_API_KEY");
async function post(url,data,idempotency){
 const response=await fetch(url,{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{"Content-Type":"application/json",
   "Authorization":"Bearer "+token,
   ...(idempotency?{"Idempotency-Key":idempotency}:{})},
  body:JSON.stringify(data),signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)throw new Error("Audit archive sandbox HTTP "+response.status);
 return response.json();
}
const receipt=await post(createUrl,envelope,digest);
if(receipt.eventId!==eventId||receipt.digest!==digest||
 receipt.status!=="archived"||typeof receipt.receiptId!=="string"||
 receipt.receiptId.length<1)
 throw new Error("Sandbox archive did not return valid event-bound receipt");
const check=await post(statusUrl,{tenantSlug,eventId,digest});
if(check.eventId!==eventId||check.digest!==digest||
 check.status!=="archived"||check.receiptId!==receipt.receiptId)
 throw new Error("Archive status lookup did not match immutable receipt");
console.log("PASS audit archive synthetic event create/read-only status contract.");
console.log("Record provider receipt under test-evidence retention policy; do not log the API secret.");
