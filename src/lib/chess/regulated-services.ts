import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {isUsableConsent} from "./onboarding";
import type {ClientService} from "@/lib/client-profile/policy";

export const regulatedServices=["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"] as const;
export function needsVerifiedLicense(service:ClientService):boolean {
 return (regulatedServices as readonly string[]).includes(service);
}
export function credentialAllowsAssignment(
 credential:{status:string,expiresAt:Date|null,verifiedAt?:Date|null,verifiedByClerkUserId?:string|null,verificationSource?:string|null,registryCheckedAt?:Date|null}|null,now=new Date(),
):boolean {
 return !!credential && credential.status==="VERIFIED" && !!credential.verifiedAt &&
  !!credential.verifiedByClerkUserId && !!credential.verificationSource && !!credential.registryCheckedAt &&
  credential.registryCheckedAt<=now && (!credential.expiresAt||credential.expiresAt>now);
}

const createCase=z.object({
 businessId:z.string().min(1),
 clientProfileId:z.string().min(1),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX","MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
 ownerClerkUserId:z.string().min(1).optional(),
}).strict();

/** Intake gate: no case creation from pending/withdrawn consent.
 * Licensed work requires an active, independently verified credential. */
export async function openChessServiceCase(input:unknown) {
 const data=createCase.parse(input);
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if (!actor || !["OWNER","ADMIN"].includes(actor.role)) throw new PermissionError("record:create");
 const {db}=getTenantDb();
 const profile=await db.clientProfile.findUnique({where:{id:data.clientProfileId},select:{id:true}});
 if (!profile) throw new PermissionError("record:read");
 const consents=await db.chessClientConsent.findMany({
  where:{clientProfileId:data.clientProfileId,businessId:data.businessId,purpose:`service:${data.service}`},
  select:{status:true,expiresAt:true,consentedAt:true,acceptedByClerkUserId:true,verifiedEmailDigest:true,acceptanceEvidenceDigest:true},
 });
 if (!consents.some(c=>isUsableConsent(c))) throw new PermissionError("record:create");
 if (data.ownerClerkUserId) {
  const assignment=await db.chessEmployeeAssignment.findUnique({where:{
   businessId_clerkUserId:{businessId:data.businessId,clerkUserId:data.ownerClerkUserId},
  },select:{revokedAt:true}});
  const member=await db.membership.findUnique({where:{clerkUserId:data.ownerClerkUserId},select:{status:true}});
  if (!assignment || assignment.revokedAt || member?.status!=="ACTIVE") throw new PermissionError("record:create");
 }
 if (needsVerifiedLicense(data.service)) {
  if (!data.ownerClerkUserId) throw new PermissionError("record:create");
  const credentials=await db.chessPractitionerCredential.findMany({
   where:{businessId:data.businessId,clerkUserId:data.ownerClerkUserId,service:data.service},
   select:{status:true,expiresAt:true,verifiedAt:true,verifiedByClerkUserId:true,verificationSource:true,registryCheckedAt:true},
  });
  if (!credentials.some(c=>credentialAllowsAssignment(c))) throw new PermissionError("record:create");
 }
 return db.chessServiceCase.create({data,select:{
  id:true,businessId:true,clientProfileId:true,service:true,status:true,
 }});
}


type CaseStatus="INTAKE"|"REVIEW"|"ACTIVE"|"HOLD"|"CLOSED";
const validTransitions:Record<CaseStatus,readonly CaseStatus[]>={
 INTAKE:["REVIEW","CLOSED"],
 REVIEW:["ACTIVE","HOLD","CLOSED"],
 ACTIVE:["HOLD","CLOSED"],
 HOLD:["REVIEW","CLOSED"],
 CLOSED:[],
};
export function canTransitionServiceCase(from:CaseStatus,to:CaseStatus):boolean {
 return validTransitions[from]?.includes(to) ?? false;
}

/** Admin-controlled progress transition with re-evaluation of recorded consent
 * and independent license evidence before entering ACTIVE status. */
export async function transitionChessServiceCase(
 caseId:string,businessId:string,target:CaseStatus,
) {
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if(!actor || !["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const record=await db.chessServiceCase.findFirst({where:{id:caseId,businessId}});
 if(!record || !canTransitionServiceCase(record.status,target))throw new PermissionError("record:update");
 if(target==="ACTIVE"){
  const consents=await db.chessClientConsent.findMany({
   where:{businessId,clientProfileId:record.clientProfileId,purpose:`service:${record.service}`},
   select:{status:true,expiresAt:true,consentedAt:true,acceptedByClerkUserId:true,
    verifiedEmailDigest:true,acceptanceEvidenceDigest:true},
  });
  if(!consents.some(c=>isUsableConsent(c)))throw new PermissionError("record:update");
  if(needsVerifiedLicense(record.service)){
   if(!record.ownerClerkUserId)throw new PermissionError("record:update");
   const creds=await db.chessPractitionerCredential.findMany({
    where:{businessId,clerkUserId:record.ownerClerkUserId,service:record.service},
    select:{status:true,expiresAt:true,verifiedAt:true,verifiedByClerkUserId:true,
     verificationSource:true,registryCheckedAt:true},
   });
   if(!creds.some(c=>credentialAllowsAssignment(c)))throw new PermissionError("record:update");
  }
 }
 const result=await db.chessServiceCase.updateMany({
  where:{id:caseId,businessId,status:record.status},data:{status:target},
 });
 if(result.count!==1)throw new PermissionError("record:update");
 return {id:caseId,status:target};
}
