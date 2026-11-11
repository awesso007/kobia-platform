import {z} from "zod";

const vendorReply=z.object({
 invoiceId:z.string().min(1).max(128),
 id:z.string().min(1).max(200).optional(),
 status:z.enum(["accepted","pending","rejected","not_found"]),
}).strict();
export function billingProviderConfigured():boolean{
 if(process.env.CHESS_BILLING_DELIVERY_ENABLED!=="true")return false;
 const host=process.env.CHESS_BILLING_ALLOWED_HOST;
 const token=process.env.CHESS_BILLING_API_KEY;
 const urls=[process.env.CHESS_BILLING_DELIVERY_API_URL,
  process.env.CHESS_BILLING_STATUS_API_URL];
 if(!host||!token)return false;
 return urls.every(raw=>{
  if(!raw)return false;
  try{
   const u=new URL(raw);
   return u.protocol==="https:"&&u.hostname===host&&
    !u.username&&!u.password&&!u.hash&&!u.port;
  }catch{return false;}
 });
}
export type BillingDelivery={
 tenantSlug:string;businessId:string;clientProfileId:string;
 serviceCaseId:string;invoiceId:string;service:string;
 descriptionCode:string;currency:"USD";amountCents:string;
 idempotencyKey:string;
};
async function call(url:string,body:unknown,key?:string){
 const result=await fetch(url,{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{"Content-Type":"application/json",
   "Authorization":`Bearer ${process.env.CHESS_BILLING_API_KEY!}`,
   ...(key?{"Idempotency-Key":key}:{})},
  body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
 });
 if(!result.ok)throw new Error(`Billing vendor returned HTTP ${result.status}`);
 return vendorReply.parse(await result.json());
}
/** Vendor creates a client invoice only; it must never charge a card,
 * debit an account, attempt collections or perform a payroll transfer.
 * Client billing contact is resolved by the approved vendor separately. */
export async function deliverChessInvoice(input:BillingDelivery){
 if(!billingProviderConfigured())throw new Error("Invoice delivery disabled.");
 const reply=await call(process.env.CHESS_BILLING_DELIVERY_API_URL!,input,input.idempotencyKey);
 if(reply.invoiceId!==input.invoiceId||
  (reply.status==="accepted"&&!reply.id))
  throw new Error("Provider invoice response did not match request.");
 return reply;
}
export async function checkChessInvoiceStatus(input:{
 tenantSlug:string;businessId:string;invoiceId:string;
 idempotencyKey:string;providerInvoiceId:string|null;
}){
 if(!billingProviderConfigured())throw new Error("Invoice status lookup disabled.");
 const reply=await call(process.env.CHESS_BILLING_STATUS_API_URL!,input);
 if(reply.invoiceId!==input.invoiceId ||
  (input.providerInvoiceId&&reply.id!==input.providerInvoiceId)||
  (reply.status==="accepted"&&!reply.id))
  throw new Error("Provider status was not for the expected invoice.");
 return reply;
}
