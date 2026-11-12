import {createHmac,createHash} from "node:crypto";
import {auth,currentUser} from "@clerk/nextjs/server";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {z} from "zod";
import {guardAndCancelReservedFinancialAttempts} from "./financial-attempt-guard";

const request=z.object({
 consentId:z.string().min(1).max(128),
 policyVersion:z.string().min(1).max(60),
 accept:z.literal(true),
}).strict();

function hmac(message:string):string {
 const secret=process.env.CHESS_CONSENT_EVIDENCE_KEY;
 if (!secret || secret.length<32) throw new Error("Consent evidence key not configured.");
 return createHmac("sha256",secret).update(message).digest("hex");
}
export function normalizeEmail(email:string):string {return email.trim().toLowerCase();}

/**
 * Verified client-facing consent acceptance:
 * - live Clerk user ID and verified primary email
 * - email must match a CRM contact linked to requested client profile
 * - immutable policy version match, explicit acceptance, and conditional state transition
 * - HMAC evidence to avoid storing cleartext email in consent audit fields
 *
 * Not a legally binding e-signature solution; separate provider required.
 */
export async function acceptClientConsent(input:unknown) {
 const data=request.parse(input);
 const clerkUserId=auth().userId;
 const user=await currentUser();
 if (!clerkUserId || !user || user.id!==clerkUserId) throw new PermissionError("record:update");
 const primary=user.primaryEmailAddress;
 if (!primary?.emailAddress || primary.verification?.status!=="verified") {
  throw new PermissionError("record:update");
 }
 const email=normalizeEmail(primary.emailAddress);
 const {db}=getTenantDb();
 const consent=await db.chessClientConsent.findUnique({where:{id:data.consentId}});
 if (!consent || consent.status!=="PENDING" || consent.policyVersion!==data.policyVersion ||
     !consent.policyText || consent.policyText.length<50 ||
     (consent.expiresAt && consent.expiresAt<=new Date())) throw new PermissionError("record:update");
 const profile=await db.clientProfile.findUnique({where:{id:consent.clientProfileId},
  select:{contactId:true}});
 if (!profile?.contactId) throw new PermissionError("record:update");
 const contact=await db.contact.findUnique({where:{id:profile.contactId},select:{email:true}});
 if (!contact?.email || normalizeEmail(contact.email)!==email) throw new PermissionError("record:update");
 const date=new Date();
 const emailDigest=hmac(email);
 const evidence=hmac([consent.id,consent.businessId,consent.clientProfileId,consent.purpose,
  data.policyVersion,createHash("sha256").update(consent.policyText).digest("hex"),
  clerkUserId,emailDigest,date.toISOString(),"accept"].join("|"));
 const result=await db.$transaction(async tx=>{
  const changed=await tx.chessClientConsent.updateMany({
   where:{id:consent.id,status:"PENDING",policyVersion:data.policyVersion,
    OR:[{expiresAt:null},{expiresAt:{gt:date}}]},
   data:{status:"GRANTED",consentedAt:date,acceptedByClerkUserId:clerkUserId,
    verifiedEmailDigest:emailDigest,acceptanceEvidenceDigest:evidence},
  });
  if(changed.count===1) {
   await tx.chessSecurityEvent.create({data:{
    businessId:consent.businessId,actorClerkUserId:clerkUserId,
    action:"CLIENT_CONSENT_GRANTED",resourceType:"ChessClientConsent",
    resourceId:consent.id,decision:"ALLOW",
   }});
  }
  return changed;
 });
 if (result.count!==1) throw new PermissionError("record:update");
 return {accepted:true,consentId:consent.id,consentedAt:date};
}

/** Client can withdraw with a verified session bound to their recorded grant. */
export async function withdrawOwnClientConsent(consentId:string) {
 const clerkUserId=auth().userId;
 if(!clerkUserId)throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const now=new Date();
 const result=await db.$transaction(async tx=>{
  await guardAndCancelReservedFinancialAttempts(tx,consentId,now,clerkUserId);
  const changed=await tx.chessClientConsent.updateMany({
   where:{id:consentId,status:"GRANTED",acceptedByClerkUserId:clerkUserId},
   data:{status:"WITHDRAWN",withdrawnAt:now},
  });
  if(changed.count===1){
   const consent=await tx.chessClientConsent.findUnique({where:{id:consentId},
    select:{businessId:true,clientProfileId:true,purpose:true}});
   const match=consent?.purpose.match(/^(?:billing|service):(ACCOUNTING|BOOKKEEPING|PAYROLL|TAX)$/);
   if(consent&&match){
    const paused=await tx.chessBillingSubscriptionPlan.updateMany({where:{
     businessId:consent.businessId,clientProfileId:consent.clientProfileId,
     service:match[1] as "ACCOUNTING"|"BOOKKEEPING"|"PAYROLL"|"TAX",
     status:"ACTIVE",
    },data:{status:"PAUSED"}});
    if(paused.count)await tx.chessSecurityEvent.create({data:{
     businessId:consent.businessId,actorClerkUserId:clerkUserId,
     action:"RECURRING_INVOICE_PLANS_PAUSED_CONSENT_WITHDRAWN",
     resourceType:"ChessClientConsent",resourceId:consentId,decision:"DENY",
    }});
   }
   await tx.chessSecurityEvent.create({data:{
    businessId:consent?.businessId,actorClerkUserId:clerkUserId,action:"CLIENT_CONSENT_WITHDRAWN",
    resourceType:"ChessClientConsent",resourceId:consentId,decision:"ALLOW",
   }});
  }
  return changed;
 },{isolationLevel:"Serializable"});
 if(result.count!==1)throw new PermissionError("record:update");
 return {withdrawn:true};
}
