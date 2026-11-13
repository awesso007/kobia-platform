import { z } from "zod";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { assertBusinessAccess } from "./business-units";
import { guardAndCancelReservedFinancialAttempts } from "./financial-attempt-guard";

const requestSchema = z.object({
 businessId: z.string().min(1).max(128),
 clientProfileId: z.string().min(1).max(128),
 purpose: z.string().trim().min(4).max(200),
 policyVersion: z.string().trim().min(1).max(60),
 policyText: z.string().trim().min(50).max(20000),
 expiresAt: z.coerce.date().optional(),
}).strict();

/** A PENDING request grants no sharing authority. Acceptance takes place
 * through separately verified Clerk client identity and policy matching. */
export async function requestClientConsent(input: unknown) {
 const data=requestSchema.parse(input);
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if (!actor || !["OWNER","ADMIN"].includes(actor.role)) throw new PermissionError("record:create");
 const {db}=getTenantDb();
 const profile=await db.clientProfile.findUnique({where:{id:data.clientProfileId},select:{id:true}});
 if (!profile) throw new PermissionError("record:read");
 return db.$transaction(async tx=>{
  const consent=await tx.chessClientConsent.create({
   data,select:{id:true,businessId:true,clientProfileId:true,
    purpose:true,policyVersion:true,status:true},
  });
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"CLIENT_CONSENT_REQUESTED",resourceType:"ChessClientConsent",
   resourceId:consent.id,decision:"REVIEW",
  }});
  return consent;
 });
}

/** Admin withdrawal is independently audited; client self-service
 * withdrawal is available in the approval-gated consent portal. */
export async function withdrawClientConsent(consentId: string,businessId: string) {
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if (!actor || !["OWNER","ADMIN"].includes(actor.role)) throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const now=new Date();
 return db.$transaction(async tx=>{
  await guardAndCancelReservedFinancialAttempts(tx,consentId,now,undefined,businessId);
  const changed=await tx.chessClientConsent.updateMany({
   where:{id:consentId,businessId,status:"GRANTED"},
   data:{status:"WITHDRAWN",withdrawnAt:now},
  });
  if(changed.count===1){
   const consent=await tx.chessClientConsent.findUnique({
    where:{id:consentId},select:{clientProfileId:true,purpose:true},
   });
   const match=consent?.purpose.match(/^(?:billing|service):(ACCOUNTING|BOOKKEEPING|PAYROLL|TAX)$/);
   if(consent&&match){
    const paused=await tx.chessBillingSubscriptionPlan.updateMany({where:{
     businessId,clientProfileId:consent.clientProfileId,
     service:match[1] as "ACCOUNTING"|"BOOKKEEPING"|"PAYROLL"|"TAX",
     status:"ACTIVE",
    },data:{status:"PAUSED"}});
    if(paused.count)await tx.chessSecurityEvent.create({data:{
     businessId,actorClerkUserId:actor.clerkUserId,
     action:"RECURRING_INVOICE_PLANS_PAUSED_CONSENT_WITHDRAWN",
     resourceType:"ChessClientConsent",resourceId:consentId,decision:"DENY",
    }});
   }
   await tx.chessSecurityEvent.create({data:{
    businessId,actorClerkUserId:actor.clerkUserId,
    action:"CLIENT_CONSENT_WITHDRAWN",resourceType:"ChessClientConsent",
    resourceId:consentId,decision:"ALLOW",
   }});
  }
  return changed;
 },{isolationLevel:"Serializable"});
}

export function isUsableConsent(consent: {status:string; expiresAt:Date|null; consentedAt?:Date|null; acceptedByClerkUserId?:string|null; verifiedEmailDigest?:string|null; acceptanceEvidenceDigest?:string|null; withdrawnAt?:Date|null},now=new Date()) {
 const digest=/^[a-f0-9]{64}$/;
 return consent.status==="GRANTED" && !consent.withdrawnAt && !!consent.consentedAt &&
  consent.consentedAt<=now && !!consent.acceptedByClerkUserId &&
  digest.test(consent.verifiedEmailDigest??"") &&
  digest.test(consent.acceptanceEvidenceDigest??"") &&
  (!consent.expiresAt || consent.expiresAt>now);
}
