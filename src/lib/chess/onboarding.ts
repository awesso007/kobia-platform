import { z } from "zod";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { assertBusinessAccess } from "./business-units";

const requestSchema = z.object({
 businessId: z.string().min(1).max(128),
 clientProfileId: z.string().min(1).max(128),
 purpose: z.string().trim().min(4).max(200),
 policyVersion: z.string().trim().min(1).max(60),
 policyText: z.string().trim().min(50).max(20000),
 expiresAt: z.coerce.date().optional(),
}).strict();

/** A pending request is not permission to share data. Client acceptance is a
 * separate authenticated workflow and is intentionally not implemented here. */
export async function requestClientConsent(input: unknown) {
 const data=requestSchema.parse(input);
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if (!actor || !["OWNER","ADMIN"].includes(actor.role)) throw new PermissionError("record:create");
 const {db}=getTenantDb();
 const profile=await db.clientProfile.findUnique({where:{id:data.clientProfileId},select:{id:true}});
 if (!profile) throw new PermissionError("record:read");
 return db.chessClientConsent.create({
  data, select:{id:true,businessId:true,clientProfileId:true,purpose:true,policyVersion:true,status:true},
 });
}

/** Withdrawal is always available to a verified administrative actor.
 * A future client portal must also allow authenticated self-service withdrawal. */
export async function withdrawClientConsent(consentId: string,businessId: string) {
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if (!actor || !["OWNER","ADMIN"].includes(actor.role)) throw new PermissionError("record:update");
 const {db}=getTenantDb();
 return db.chessClientConsent.updateMany({
  where:{id:consentId,businessId,status:"GRANTED"},
  data:{status:"WITHDRAWN",withdrawnAt:new Date()},
 });
}

export function isUsableConsent(consent: {status:string; expiresAt:Date|null; consentedAt?:Date|null; acceptedByClerkUserId?:string|null; verifiedEmailDigest?:string|null; acceptanceEvidenceDigest?:string|null},now=new Date()) {
 return consent.status==="GRANTED" && !!consent.consentedAt && consent.consentedAt<=now &&
  !!consent.acceptedByClerkUserId && !!consent.verifiedEmailDigest &&
  !!consent.acceptanceEvidenceDigest && (!consent.expiresAt || consent.expiresAt>now);
}
