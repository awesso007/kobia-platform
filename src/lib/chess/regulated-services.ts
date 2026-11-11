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
 credential:{status:string,expiresAt:Date|null}|null,now=new Date(),
):boolean {
 return !!credential && credential.status==="VERIFIED" && (!credential.expiresAt||credential.expiresAt>now);
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
  select:{status:true,expiresAt:true},
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
   select:{status:true,expiresAt:true},
  });
  if (!credentials.some(c=>credentialAllowsAssignment(c))) throw new PermissionError("record:create");
 }
 return db.chessServiceCase.create({data,select:{
  id:true,businessId:true,clientProfileId:true,service:true,status:true,
 }});
}
