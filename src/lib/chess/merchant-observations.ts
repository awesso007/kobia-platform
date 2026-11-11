import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {assertBusinessManager} from "./business-manager";
import {listChessInvoices} from "./billing";
import {PermissionError} from "@/lib/rbac/require-permission";

const ref=z.string().regex(/^[A-Za-z0-9_-]{2,160}$/);
export const merchantObservationSchema=z.object({
 tenantSlug:z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/),
 providerId:ref,
 businessId:z.string().min(1).max(128),
 invoiceId:z.string().min(1).max(128),
 providerInvoiceId:ref,
 providerEventId:z.string().regex(/^[A-Za-z0-9_-]{8,160}$/),
 eventKind:z.enum(["PAYMENT_CAPTURED","REFUND_OBSERVED","CHARGEBACK_OBSERVED"]),
 amountCents:z.string().regex(/^[1-9][0-9]{0,12}$/),
 currency:z.literal("USD"),
 occurredAt:z.string().datetime(),
}).strict();

export function merchantWebhookConfigured():boolean{
 return process.env.CHESS_MERCHANT_WEBHOOK_ENABLED==="true"&&
  process.env.CHESS_MERCHANT_VENDOR_CERTIFIED==="true"&&
  process.env.CHESS_MERCHANT_SETTLEMENT_POLICY_APPROVED==="true"&&
  !!process.env.CHESS_MERCHANT_PROVIDER_ID&&
  !!process.env.CHESS_MERCHANT_WEBHOOK_HMAC_KEY&&
  process.env.CHESS_MERCHANT_WEBHOOK_HMAC_KEY.length>=32;
}
export function verifyMerchantWebhookSignature(raw:string,tenantSlug:string,
 timestamp:string|null,signature:string|null,now=Date.now()):boolean{
 if(!merchantWebhookConfigured()||raw.length>8192||
  !timestamp||!signature||!/^[a-f0-9]{64}$/.test(signature)||
  !/^[0-9]{13}$/.test(timestamp)||
  !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(tenantSlug))
  return false;
 const time=Number(timestamp);
 if(!Number.isSafeInteger(time)||Math.abs(now-time)>300000)return false;
 const expected=createHmac("sha256",process.env.CHESS_MERCHANT_WEBHOOK_HMAC_KEY!)
  .update(tenantSlug+"."+timestamp+"."+raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature,"hex"));
}
export function merchantObservationDigest(tenantSlug:string,raw:string){
 return createHash("sha256").update(JSON.stringify({
  purpose:"CHESS_M7_MERCHANT_OBSERVATION_V1",tenantSlug,raw,
 })).digest("hex");
}
/** A signed merchant assertion is evidence for supervised collections review.
 * It DOES NOT mark an invoice paid, post a journal, issue refunds or move
 * funds. Only an independent verified bank settlement could do that. */
export async function recordChessMerchantObservation(input:{
 tenantSlug:string;raw:string;timestamp:string|null;signature:string|null;
}){
 if(!verifyMerchantWebhookSignature(input.raw,input.tenantSlug,
  input.timestamp,input.signature))throw new PermissionError("record:create");
 const payload=merchantObservationSchema.parse(JSON.parse(input.raw) as unknown);
 if(payload.tenantSlug!==input.tenantSlug||
  payload.providerId!==process.env.CHESS_MERCHANT_PROVIDER_ID||
  new Date(payload.occurredAt).getTime()>Date.now()+300000||
  new Date(payload.occurredAt).getTime()<Date.now()-90*86400000)
  throw new PermissionError("record:create");
 const {db,tenantId}=getTenantDb();
 if(tenantId!==input.tenantSlug)throw new PermissionError("record:create");
 const digest=merchantObservationDigest(tenantId,input.raw);
 const existing=await db.chessMerchantPaymentEvent.findUnique({where:{
  providerEventId:payload.providerEventId,
 }});
 if(existing){
  if(existing.eventDigest!==digest||existing.invoiceId!==payload.invoiceId||
   existing.businessId!==payload.businessId)
   throw new PermissionError("record:create");
  return {accepted:true,duplicate:true,settlementVerified:false};
 }
 const invoice=await db.chessBillingInvoice.findFirst({where:{
  id:payload.invoiceId,businessId:payload.businessId,
  providerInvoiceId:payload.providerInvoiceId,
  status:{in:["SENT","UNKNOWN","SUBMITTING"]},
 },select:{id:true,amountCents:true}});
 if(!invoice||BigInt(payload.amountCents)>invoice.amountCents)
  throw new PermissionError("record:create");
 await db.$transaction(async tx=>{
  const event=await tx.chessMerchantPaymentEvent.create({data:{
   businessId:payload.businessId,invoiceId:invoice.id,
   providerInvoiceId:payload.providerInvoiceId,
   providerEventId:payload.providerEventId,
   eventKind:payload.eventKind,amountCents:BigInt(payload.amountCents),
   currency:payload.currency,occurredAt:new Date(payload.occurredAt),
   eventDigest:digest,
  },select:{id:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:payload.businessId,
   action:"MERCHANT_PAYMENT_CLAIM_RECORDED",
   resourceType:"ChessMerchantPaymentEvent",resourceId:event.id,
   decision:"REVIEW",
  }});
 });
 return {accepted:true,duplicate:false,settlementVerified:false};
}
/** Manager-facing observations are visible only while the same invoice
 * remains accessible under the existing live grant and client consent. */
export async function listChessMerchantObservations(businessId:string){
 const actor=await assertBusinessManager(businessId);
 if(actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:read");
 const permitted=await listChessInvoices(businessId);
 if(!permitted.length)return [];
 const {db}=getTenantDb();
 const rows=await db.chessMerchantPaymentEvent.findMany({
  where:{businessId,invoiceId:{in:permitted.map(x=>x.id)}},
  orderBy:{receivedAt:"desc"},take:100,
  select:{id:true,invoiceId:true,eventKind:true,amountCents:true,
   currency:true,status:true,occurredAt:true,receivedAt:true},
 });
 return rows.map(r=>({...r,amountCents:r.amountCents.toString()}));
}
