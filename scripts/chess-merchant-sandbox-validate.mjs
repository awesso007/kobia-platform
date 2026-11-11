/** Manual, isolated M7 merchant callback contract test. Pre-seed a
 * FICTIONAL approved invoice in an independently protected tenant staging DB.
 * This tests receipt ingestion only: it NEVER charges a card, executes a
 * refund, calls a payment provider or posts a journal. */
import {createHmac,randomUUID} from "node:crypto";
function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" required in protected fictional merchant sandbox");
 return value;
}
if(process.env.CHESS_M7_MERCHANT_SANDBOX_VALIDATE!=="true"||
 process.env.CHESS_M7_MERCHANT_SANDBOX_ISOLATED!=="true")
 throw new Error("Synthetic merchant callback test has not been authorized.");
const base=new URL(required("CHESS_M7_MERCHANT_SANDBOX_BASE_URL"));
if(base.protocol!=="https:"||
 base.hostname!==required("CHESS_M7_MERCHANT_SANDBOX_ALLOWED_HOST")||
 base.username||base.password||base.hash||base.port||
 base.pathname!=="/"||base.search)
 throw new Error("Merchant callback sandbox requires exact allowlisted HTTPS origin.");
const tenant=required("CHESS_M7_SANDBOX_TENANT");
if(!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(tenant))
 throw new Error("Merchant sandbox tenant slug invalid.");
const key=required("CHESS_MERCHANT_WEBHOOK_HMAC_KEY");
if(key.length<32)throw new Error("Merchant HMAC secret is too short.");
const url=new URL("/api/chess/merchant-events",base);
url.searchParams.set("t",tenant);
const stamp=String(Date.now());
const payload={
 tenantSlug:tenant,providerId:required("CHESS_MERCHANT_PROVIDER_ID"),
 businessId:required("CHESS_M7_SANDBOX_BUSINESS_ID"),
 invoiceId:required("CHESS_M7_SANDBOX_INVOICE_ID"),
 providerInvoiceId:required("CHESS_M7_SANDBOX_PROVIDER_INVOICE_ID"),
 providerEventId:"m7_synthetic_"+randomUUID().replaceAll("-",""),
 eventKind:"PAYMENT_CAPTURED",amountCents:"1",currency:"USD",
 occurredAt:new Date().toISOString(),
};
const raw=JSON.stringify(payload);
const signed=createHmac("sha256",key).update(tenant+"."+stamp+"."+raw).digest("hex");
async function invoke(body,signature){
 const response=await fetch(url,{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{"Content-Type":"application/json",
   "x-chess-merchant-timestamp":stamp,
   "x-chess-merchant-signature":signature},
  body,signal:AbortSignal.timeout(15000),
 });
 const result=await response.json();
 return {status:response.status,accepted:result?.accepted,
  duplicate:result?.duplicate,settlementVerified:result?.settlementVerified};
}
const first=await invoke(raw,signed);
if(first.status!==202||first.accepted!==true||
 first.duplicate!==false||first.settlementVerified!==false)
 throw new Error("Isolated merchant acceptance did not produce an unsettled, first-seen observation.");
const replay=await invoke(raw,signed);
if(replay.status!==200||replay.duplicate!==true||
 replay.settlementVerified!==false)
 throw new Error("Idempotent replay did not return the existing unsettled observation.");
const tampered=await invoke(raw+" ",signed);
if(tampered.status!==403)
 throw new Error("Tampered merchant signature was incorrectly accepted.");
console.log("PASS fictional merchant webhook receipt, replay and tamper contract. No funds moved.");
console.log("Retention: remove the fictional test invoice and event only under an approved isolated test-database reset; append-only receipt cannot be edited.");
