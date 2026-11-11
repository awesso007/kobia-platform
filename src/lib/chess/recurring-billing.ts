import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {scopedInvoiceCase,productCodes} from "./billing";
import {isUsableConsent} from "./onboarding";
import {invoiceDigest} from "./billing";

const id=z.string().min(1).max(128);
const serviceSchema=z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX"]);
const create=z.object({
 businessId:id,clientProfileId:id,serviceCaseId:id,
 service:serviceSchema,
 descriptionCode:z.enum([
  "ACCOUNTING_MONTHLY","ACCOUNTING_PROJECT","BOOKKEEPING_MONTHLY",
  "BOOKKEEPING_CLEANUP","PAYROLL_PROCESSING","TAX_PREPARATION","TAX_PLANNING",
 ]),
 amountCents:z.number().int().min(1).max(1_000_000_000),
}).strict();
const action=z.object({businessId:id,planId:id}).strict();

export function nextUtcBillingMonth(now=new Date()):Date{
 return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
}
export function subscriptionInvoiceKey(planId:string,date:Date):string{
 const key=`sub_${planId}_${date.toISOString().slice(0,7).replace("-","")}`;
 if(!/^[A-Za-z0-9_-]{8,96}$/.test(key))throw new Error("Invalid recurring invoice key.");
 return key;
}
export function recurringInvoiceDraftsEnabled():boolean{
 return process.env.CHESS_BILLING_RECURRING_DRAFTS_ENABLED==="true"&&
  process.env.CHESS_BILLING_RECURRING_POLICY_APPROVED==="true"&&
  process.env.CHESS_SCHEDULER_ENABLED==="true";
}
export async function createChessRecurringPlan(input:unknown){
 const data=create.parse(input);
 if(!(productCodes[data.service] as readonly string[]).includes(data.descriptionCode))
  throw new PermissionError("record:create");
 const state=await scopedInvoiceCase(data.businessId,data.clientProfileId,
  data.serviceCaseId,data.service);
 const nextDraftAt=nextUtcBillingMonth();
 return state.db.$transaction(async tx=>{
  const plan=await tx.chessBillingSubscriptionPlan.create({data:{
   ...data,amountCents:BigInt(data.amountCents),
   nextDraftAt,createdByClerkUserId:state.actor.clerkUserId,
  },select:{id:true,status:true,nextDraftAt:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
   action:"RECURRING_INVOICE_PLAN_DRAFTED",
   resourceType:"ChessBillingSubscriptionPlan",
   resourceId:plan.id,decision:"REVIEW",
  }});
  return plan;
 });
}
export async function approveChessRecurringPlan(input:unknown){
 const data=action.parse(input);
 const actor=await assertBusinessManager(data.businessId);
 if(actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const plan=await db.chessBillingSubscriptionPlan.findFirst({where:{
  id:data.planId,businessId:data.businessId,status:"PENDING",
 }});
 if(!plan||plan.createdByClerkUserId===actor.clerkUserId||
  !(plan.service in productCodes))
  throw new PermissionError("record:update");
 await scopedInvoiceCase(data.businessId,plan.clientProfileId,plan.serviceCaseId,
  plan.service as keyof typeof productCodes);
 return db.$transaction(async tx=>{
  const changed=await tx.chessBillingSubscriptionPlan.updateMany({where:{
   id:plan.id,businessId:data.businessId,status:"PENDING",
  },data:{status:"ACTIVE",approvedByClerkUserId:actor.clerkUserId,
   approvedAt:new Date()}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"RECURRING_INVOICE_PLAN_APPROVED",
   resourceType:"ChessBillingSubscriptionPlan",resourceId:plan.id,
   decision:"ALLOW",
  }});
  return {id:plan.id,status:"ACTIVE" as const};
 });
}
export async function pauseChessRecurringPlan(input:unknown){
 const data=action.parse(input);
 const actor=await assertBusinessManager(data.businessId);
 if(actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const plan=await db.chessBillingSubscriptionPlan.findFirst({where:{
  id:data.planId,businessId:data.businessId,status:"ACTIVE",
 }});
 if(!plan||!(plan.service in productCodes))
  throw new PermissionError("record:update");
 await scopedInvoiceCase(data.businessId,plan.clientProfileId,plan.serviceCaseId,
  plan.service as keyof typeof productCodes);
 return db.$transaction(async tx=>{
  const changed=await tx.chessBillingSubscriptionPlan.updateMany({
   where:{id:plan.id,status:"ACTIVE"},data:{status:"PAUSED"},
  });
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"RECURRING_INVOICE_PLAN_PAUSED",
   resourceType:"ChessBillingSubscriptionPlan",resourceId:plan.id,
   decision:"ALLOW",
  }});
  return {id:plan.id,status:"PAUSED" as const};
 });
}
export async function listChessRecurringPlans(businessId:string){
 const actor=await assertBusinessManager(id.parse(businessId));
 if(actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const rows=await db.chessBillingSubscriptionPlan.findMany({where:{businessId},
  orderBy:{createdAt:"desc"},take:100,
 });
 const visible:typeof rows=[];
 for(const row of rows){
  if(!(row.service in productCodes))continue;
  try{
   await scopedInvoiceCase(businessId,row.clientProfileId,row.serviceCaseId,
    row.service as keyof typeof productCodes);
   visible.push(row);
  }catch{/* No billing consent: no client or plan metadata is disclosed. */}
 }
 return visible.map(({createdByClerkUserId,approvedByClerkUserId,...row})=>({
  ...row,amountCents:row.amountCents.toString(),
  mayApprove:row.status==="PENDING"&&
   createdByClerkUserId!==actor.clerkUserId,
  mayPause:row.status==="ACTIVE",
 }));
}
/** Scheduler generates DRAFT invoices only, with existing client
 * permissions, live billing consent and independent plan approval.
 * It never delivers an invoice or charges a customer. */
export async function runChessRecurringInvoiceDrafts(now=new Date()){
 if(!recurringInvoiceDraftsEnabled())
  return {disabled:true,examined:0,created:0,blocked:0,paused:0};
 const {db,tenantId}=getTenantDb();
 const plans=await db.chessBillingSubscriptionPlan.findMany({where:{
  status:"ACTIVE",nextDraftAt:{lte:now},
 },orderBy:{nextDraftAt:"asc"},take:20});
 let created=0,blocked=0,paused=0;
 for(const plan of plans){
  try{
   const outcome=await db.$transaction(async tx=>{
    const current=await tx.chessBillingSubscriptionPlan.findUnique({
     where:{id:plan.id},
    });
    if(!current||current.status!=="ACTIVE"||
     current.nextDraftAt.getTime()!==plan.nextDraftAt.getTime()||
     !current.approvedByClerkUserId||!current.approvedAt||
     current.approvedByClerkUserId===current.createdByClerkUserId||
     !(current.service in productCodes))
     throw new Error("Recurring plan approval or claim has changed.");
    const [business,record,author,reviewer,grants,consents]=await Promise.all([
     tx.chessBusinessUnit.findFirst({where:{
      id:current.businessId,status:"ACTIVE",
     },select:{id:true}}),
     tx.chessServiceCase.findFirst({where:{
      id:current.serviceCaseId,businessId:current.businessId,
      clientProfileId:current.clientProfileId,service:current.service,
      status:"ACTIVE",
     },select:{id:true}}),
     tx.membership.findUnique({where:{
      clerkUserId:current.createdByClerkUserId,
     },select:{status:true,role:true}}),
     tx.membership.findUnique({where:{
      clerkUserId:current.approvedByClerkUserId,
     },select:{status:true,role:true}}),
     tx.clientServiceLink.findUnique({where:{
      profileId_businessId_service:{
       profileId:current.clientProfileId,
       businessId:current.businessId,service:current.service,
      },
     },select:{grants:{where:{
      canRead:true,canWrite:true,revokedAt:null,
      clerkUserId:{in:[current.createdByClerkUserId,
       current.approvedByClerkUserId]},
     },select:{clerkUserId:true}}}}),
     tx.chessClientConsent.findMany({where:{
      businessId:current.businessId,clientProfileId:current.clientProfileId,
      purpose:{in:[`service:${current.service}`,`billing:${current.service}`]},
     },select:{purpose:true,status:true,expiresAt:true,consentedAt:true,
      acceptedByClerkUserId:true,verifiedEmailDigest:true,
      acceptanceEvidenceDigest:true}}),
    ]);
    const purposes=[`service:${current.service}`,`billing:${current.service}`];
    const grantsOk=[current.createdByClerkUserId,
     current.approvedByClerkUserId].every(id=>
      grants?.grants.some(g=>g.clerkUserId===id));
    const authorized=!!business&&!!record&&grantsOk&&
     author?.status==="ACTIVE"&&reviewer?.status==="ACTIVE"&&
     ["OWNER","ADMIN"].includes(author.role)&&
     ["OWNER","ADMIN"].includes(reviewer.role)&&
     purposes.every(p=>consents.some(c=>c.purpose===p&&isUsableConsent(c,now)));
    if(!authorized){
     const hold=await tx.chessBillingSubscriptionPlan.updateMany({
      where:{id:current.id,status:"ACTIVE",nextDraftAt:current.nextDraftAt},
      data:{status:"PAUSED"},
     });
     if(hold.count!==1)throw new Error("Recurring plan changed on pause.");
     await tx.chessSecurityEvent.create({data:{
      businessId:current.businessId,
      action:"RECURRING_INVOICE_PLAN_PAUSED_AUTH_CHANGED",
      resourceType:"ChessBillingSubscriptionPlan",resourceId:current.id,
      decision:"DENY",
     }});
     return "PAUSED" as const;
    }
    const requestKey=subscriptionInvoiceKey(current.id,current.nextDraftAt);
    const digest=invoiceDigest({tenantSlug:tenantId,
     businessId:current.businessId,clientProfileId:current.clientProfileId,
     serviceCaseId:current.serviceCaseId,service:current.service,
     descriptionCode:current.descriptionCode,
     amountCents:current.amountCents.toString(),requestKey,
    });
    const prior=await tx.chessBillingInvoice.findUnique({where:{
     serviceCaseId_requestKey:{
      serviceCaseId:current.serviceCaseId,requestKey,
     },
    },select:{sourceDigest:true}});
    if(prior&&prior.sourceDigest!==digest)
     throw new Error("Conflicting recurring invoice source fingerprint.");
    if(!prior)await tx.chessBillingInvoice.create({data:{
     businessId:current.businessId,clientProfileId:current.clientProfileId,
     serviceCaseId:current.serviceCaseId,service:current.service,
     descriptionCode:current.descriptionCode,amountCents:current.amountCents,
     requestKey,sourceDigest:digest,idempotencyKey:digest,
     createdByClerkUserId:current.createdByClerkUserId,
    }});
    const next=nextUtcBillingMonth(current.nextDraftAt);
    const advanced=await tx.chessBillingSubscriptionPlan.updateMany({
     where:{id:current.id,status:"ACTIVE",nextDraftAt:current.nextDraftAt},
     data:{nextDraftAt:next,lastDraftAt:current.nextDraftAt},
    });
    if(advanced.count!==1)throw new Error("Recurring plan schedule changed.");
    await tx.chessSecurityEvent.create({data:{
     businessId:current.businessId,
     action:prior?"RECURRING_INVOICE_DRAFT_ALREADY_EXISTS":
      "RECURRING_INVOICE_DRAFT_CREATED",
     resourceType:"ChessBillingSubscriptionPlan",resourceId:current.id,
     decision:"REVIEW",
    }});
    return prior?"EXISTED" as const:"CREATED" as const;
   },{isolationLevel:"Serializable"});
   if(outcome==="CREATED")created++;
   if(outcome==="PAUSED")paused++;
  }catch{blocked++;}
 }
 return {disabled:false,examined:plans.length,created,blocked,paused};
}
