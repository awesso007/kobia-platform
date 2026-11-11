import {createHash} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {isUsableConsent} from "./onboarding";
import {billingProviderConfigured,deliverChessInvoice,
 checkChessInvoiceStatus} from "./billing-provider";

const ref=z.string().min(1).max(128);
const productCodes={
 ACCOUNTING:["ACCOUNTING_MONTHLY","ACCOUNTING_PROJECT"],
 BOOKKEEPING:["BOOKKEEPING_MONTHLY","BOOKKEEPING_CLEANUP"],
 PAYROLL:["PAYROLL_PROCESSING"],
 TAX:["TAX_PREPARATION","TAX_PLANNING"],
} as const;
type BillableService=keyof typeof productCodes;
const create=z.object({
 businessId:ref,clientProfileId:ref,serviceCaseId:ref,
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX"]),
 descriptionCode:z.enum([
  "ACCOUNTING_MONTHLY","ACCOUNTING_PROJECT","BOOKKEEPING_MONTHLY",
  "BOOKKEEPING_CLEANUP","PAYROLL_PROCESSING","TAX_PREPARATION","TAX_PLANNING",
 ]),
 amountCents:z.number().int().min(1).max(1_000_000_000),
 requestKey:z.string().regex(/^[A-Za-z0-9_-]{8,96}$/),
}).strict();
const review=z.object({
 businessId:ref,invoiceId:ref,
 decision:z.enum(["APPROVED","REJECTED"]),
 expectedUpdatedAt:z.string().datetime(),
}).strict();
const action=z.object({businessId:ref,invoiceId:ref}).strict();
export function invoiceDigest(input:{tenantSlug:string;businessId:string;
 clientProfileId:string;serviceCaseId:string;service:string;
 descriptionCode:string;amountCents:string;requestKey:string;}):string{
 return createHash("sha256").update(JSON.stringify({
  purpose:"CHESS_INVOICE_V1",...input,
 })).digest("hex");
}
export function canApproveInvoice(requestedBy:string,approver:string,role:string):boolean{
 return requestedBy!==approver&&["OWNER","ADMIN"].includes(role);
}
async function scopedInvoiceCase(
 businessId:string,clientProfileId:string,serviceCaseId:string,
 service:BillableService,
){
 const actor=await assertBusinessManager(businessId);
 if(!["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:update");
 const grant=await getClientServiceLink(clientProfileId,businessId,service);
 if(!grant)throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const record=await db.chessServiceCase.findFirst({where:{
  id:serviceCaseId,businessId,clientProfileId,service,status:"ACTIVE",
 },select:{id:true}});
 const link=await db.clientServiceLink.findUnique({where:{
  profileId_businessId_service:{profileId:clientProfileId,businessId,service},
 },select:{grants:{where:{clerkUserId:actor.clerkUserId,canRead:true,
  canWrite:true,revokedAt:null},select:{id:true}}}});
 if(!record||!link?.grants.length)throw new PermissionError("record:update");
 const consents=await db.chessClientConsent.findMany({where:{
  businessId,clientProfileId,purpose:{in:[`service:${service}`,
   `billing:${service}`]},
 },select:{purpose:true,status:true,expiresAt:true,consentedAt:true,
  acceptedByClerkUserId:true,verifiedEmailDigest:true,
  acceptanceEvidenceDigest:true}});
 if(![`service:${service}`,`billing:${service}`].every(p=>
  consents.some(c=>c.purpose===p&&isUsableConsent(c))))
  throw new PermissionError("record:update");
 return {actor,db,record};
}
async function accessInvoice(businessId:string,invoiceId:string){
 const {db}=getTenantDb();
 const invoice=await db.chessBillingInvoice.findFirst({where:{
  businessId,id:invoiceId,
 }});
 if(!invoice||!(invoice.service in productCodes))
  throw new PermissionError("record:read");
 const state=await scopedInvoiceCase(businessId,invoice.clientProfileId,
  invoice.serviceCaseId,invoice.service as BillableService);
 const {tenantId}=getTenantDb();
 const evidence=invoiceDigest({
  tenantSlug:tenantId,businessId:invoice.businessId,
  clientProfileId:invoice.clientProfileId,
  serviceCaseId:invoice.serviceCaseId,service:invoice.service,
  descriptionCode:invoice.descriptionCode,amountCents:invoice.amountCents.toString(),
  requestKey:invoice.requestKey,
 });
 if(evidence!==invoice.sourceDigest || invoice.idempotencyKey!==evidence)
  throw new PermissionError("record:update");
 return {...state,invoice};
}
export async function draftChessInvoice(input:unknown){
 const data=create.parse(input);
 if(!(productCodes[data.service] as readonly string[]).includes(data.descriptionCode))
  throw new PermissionError("record:create");
 const state=await scopedInvoiceCase(data.businessId,data.clientProfileId,
  data.serviceCaseId,data.service);
 const {tenantId}=getTenantDb();
 const sourceDigest=invoiceDigest({tenantSlug:tenantId,
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  serviceCaseId:data.serviceCaseId,service:data.service,
  descriptionCode:data.descriptionCode,amountCents:String(data.amountCents),
  requestKey:data.requestKey});
 const prior=await state.db.chessBillingInvoice.findUnique({where:{
  serviceCaseId_requestKey:{serviceCaseId:data.serviceCaseId,requestKey:data.requestKey},
 },select:{id:true,status:true,sourceDigest:true}});
 if(prior){
  if(prior.sourceDigest!==sourceDigest)throw new PermissionError("record:create");
  return prior;
 }
 return state.db.$transaction(async tx=>{
  const invoice=await tx.chessBillingInvoice.create({data:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   serviceCaseId:data.serviceCaseId,service:data.service,
   descriptionCode:data.descriptionCode,amountCents:BigInt(data.amountCents),
   requestKey:data.requestKey,sourceDigest,idempotencyKey:sourceDigest,
   createdByClerkUserId:state.actor.clerkUserId,
  },select:{id:true,status:true,sourceDigest:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
   action:"BILLING_INVOICE_DRAFTED",resourceType:"ChessBillingInvoice",
   resourceId:invoice.id,decision:"REVIEW",
  }});
  return invoice;
 });
}
export async function reviewChessInvoice(input:unknown){
 const data=review.parse(input);
 const state=await accessInvoice(data.businessId,data.invoiceId);
 const {actor,db,invoice}=state;
 if(invoice.status!=="DRAFT"||
  !canApproveInvoice(invoice.createdByClerkUserId,actor.clerkUserId,actor.role)||
  invoice.updatedAt.getTime()!==new Date(data.expectedUpdatedAt).getTime())
  throw new PermissionError("record:update");
 const next=data.decision==="APPROVED"?"APPROVED":"REJECTED";
 return db.$transaction(async tx=>{
  const changed=await tx.chessBillingInvoice.updateMany({where:{
   id:invoice.id,businessId:data.businessId,
   status:"DRAFT",updatedAt:invoice.updatedAt,
  },data:{status:next,...(next==="APPROVED"?{
   approvedByClerkUserId:actor.clerkUserId,approvedAt:new Date(),
  }:{})}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"BILLING_INVOICE_"+next,resourceType:"ChessBillingInvoice",
   resourceId:invoice.id,decision:next==="APPROVED"?"ALLOW":"DENY",
  }});
  return {id:invoice.id,status:next};
 });
}
export function invoiceDeliveryState(status:string):"SENT"|"UNKNOWN"|"REJECTED"{
 return status==="accepted"?"SENT":status==="rejected"?"REJECTED":"UNKNOWN";
}
/** Only sends an approved invoice request to a contracted billing processor.
 * No payment, automatic debit, collection or journal posting is possible. */
export async function sendChessInvoice(input:unknown){
 const data=action.parse(input);
 const state=await accessInvoice(data.businessId,data.invoiceId);
 const {actor,db,invoice}=state;
 if(invoice.status!=="APPROVED"||!invoice.approvedByClerkUserId||
  !invoice.approvedAt||invoice.createdByClerkUserId===invoice.approvedByClerkUserId||
  invoice.approvedByClerkUserId===actor.clerkUserId||
  invoice.createdByClerkUserId===actor.clerkUserId)
  throw new PermissionError("record:update");
 const [creator,reviewer]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:invoice.createdByClerkUserId},
   select:{status:true}}),
  db.membership.findUnique({where:{clerkUserId:invoice.approvedByClerkUserId},
   select:{status:true,role:true}}),
 ]);
 if(creator?.status!=="ACTIVE"||reviewer?.status!=="ACTIVE"||
  !["OWNER","ADMIN"].includes(reviewer.role)||
  !billingProviderConfigured())
  throw new PermissionError("record:update");
 const {tenantId}=getTenantDb();
 const claimed=await db.chessBillingInvoice.updateMany({where:{
  id:invoice.id,businessId:data.businessId,status:"APPROVED",
  updatedAt:invoice.updatedAt,
 },data:{status:"SUBMITTING",sentByClerkUserId:actor.clerkUserId}});
 if(claimed.count!==1)throw new PermissionError("record:update");
 try{
  const response=await deliverChessInvoice({
   tenantSlug:tenantId,businessId:data.businessId,
   clientProfileId:invoice.clientProfileId,serviceCaseId:invoice.serviceCaseId,
   invoiceId:invoice.id,service:invoice.service,
   descriptionCode:invoice.descriptionCode,
   currency:"USD",amountCents:invoice.amountCents.toString(),
   idempotencyKey:invoice.idempotencyKey,
  });
  let current=true;
  try{
   await scopedInvoiceCase(data.businessId,invoice.clientProfileId,
    invoice.serviceCaseId,invoice.service as BillableService);
  }catch{current=false;}
  const status=current?invoiceDeliveryState(response.status):"UNKNOWN";
  await db.$transaction(async tx=>{
   const changed=await tx.chessBillingInvoice.updateMany({where:{
    id:invoice.id,status:"SUBMITTING",
   },data:{status,providerInvoiceId:response.id??null,
    sentAt:new Date(),lastErrorCode:current?
     status==="UNKNOWN"?"PROVIDER_OUTCOME_UNCONFIRMED":null:
     "POST_ACK_CONSENT_CHANGED"}});
   if(changed.count!==1)throw new Error("Invoice delivery claim changed.");
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
    action:"BILLING_INVOICE_DELIVERY_RESULT",
    resourceType:"ChessBillingInvoice",resourceId:invoice.id,
    decision:status==="SENT"?"ALLOW":"REVIEW",
   }});
  });
  return {id:invoice.id,status,paid:false};
 }catch{
  await db.chessBillingInvoice.updateMany({where:{
   id:invoice.id,status:"SUBMITTING",
  },data:{status:"UNKNOWN",lastErrorCode:"REMOTE_DELIVERY_UNCONFIRMED"}});
  return {id:invoice.id,status:"UNKNOWN" as const,paid:false};
 }
}
export async function reconcileChessInvoice(input:unknown){
 const data=action.parse(input);
 const state=await accessInvoice(data.businessId,data.invoiceId);
 const {actor,db,invoice}=state;
 if(!["SENT","UNKNOWN","SUBMITTING"].includes(invoice.status)||
  !billingProviderConfigured())
  throw new PermissionError("record:update");
 if(invoice.status==="SUBMITTING"){
  if(Date.now()-invoice.updatedAt.getTime()<120_000)
   throw new Error("Invoice delivery is still in progress.");
  await db.chessBillingInvoice.updateMany({where:{
   id:invoice.id,status:"SUBMITTING",updatedAt:invoice.updatedAt,
  },data:{status:"UNKNOWN",lastErrorCode:"STALE_DELIVERY_CLAIM"}});
 }
 const {tenantId}=getTenantDb();
 const remote=await checkChessInvoiceStatus({tenantSlug:tenantId,
  businessId:data.businessId,invoiceId:invoice.id,
  idempotencyKey:invoice.idempotencyKey,
  providerInvoiceId:invoice.providerInvoiceId});
 const status=invoiceDeliveryState(remote.status);
 return db.$transaction(async tx=>{
  const changed=await tx.chessBillingInvoice.updateMany({where:{
   id:invoice.id,businessId:data.businessId,status:{in:["SENT","UNKNOWN"]},
  },data:{status,providerInvoiceId:remote.id??invoice.providerInvoiceId,
   providerCheckedAt:new Date(),
   lastErrorCode:status==="UNKNOWN"?"PROVIDER_OUTCOME_UNCONFIRMED":null}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"BILLING_INVOICE_RECONCILED",resourceType:"ChessBillingInvoice",
   resourceId:invoice.id,decision:status==="SENT"?"ALLOW":"REVIEW",
  }});
  return {id:invoice.id,status,paid:false};
 });
}
export async function listChessInvoices(businessId:string){
 const actor=await assertBusinessManager(businessId);
 if(!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const rows=await db.chessBillingInvoice.findMany({where:{businessId},
  orderBy:{createdAt:"desc"},take:100,select:{
   id:true,clientProfileId:true,serviceCaseId:true,service:true,
   amountCents:true,descriptionCode:true,status:true,createdAt:true,
   updatedAt:true,providerCheckedAt:true,
  }});
 const authorized:typeof rows=[];
 for(const row of rows){
  if(!(row.service in productCodes))continue;
  try{
   await scopedInvoiceCase(businessId,row.clientProfileId,row.serviceCaseId,
    row.service as BillableService);
   authorized.push(row);
  }catch{/* No invoice metadata escapes without a live client billing grant. */}
 }
 return authorized.map(row=>({...row,amountCents:row.amountCents.toString()}));
}


export async function listChessBillableCases(businessId:string){
 const actor=await assertBusinessManager(businessId);
 if(!["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const rows=await db.chessServiceCase.findMany({where:{
  businessId,status:"ACTIVE",
  service:{in:["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX"]},
 },select:{id:true,clientProfileId:true,service:true},
  orderBy:{createdAt:"desc"},take:100});
 const authorized:typeof rows=[];
 for(const row of rows){
  try{
   await scopedInvoiceCase(businessId,row.clientProfileId,row.id,
    row.service as BillableService);
   authorized.push(row);
  }catch{/* No client lacking current written billing consent is displayed. */}
 }
 return authorized;
}
