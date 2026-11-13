import type {Prisma} from "@/lib/db/generated/tenant";
import {isUsableConsent} from "./onboarding";

type Service="ACCOUNTING"|"BOOKKEEPING"|"PAYROLL"|"TAX"|"MORTGAGE"|"INSURANCE"|"REAL_ESTATE"|"INVESTMENTS";

/** A service link alone does NOT authorize document data. Check the
 * authenticated actor, current business, explicit grant, purpose-specific
 * verified client consent and withdrawal/expiry in one tenant transaction.
 * Return no client details to a caller who lacks any one condition. */
export async function authorizeChessDocumentService(
 tx:Prisma.TransactionClient,
 input:{businessId:string;clientProfileId:string;service:Service;
  actorClerkUserId:string;requireWrite?:boolean},
 now=new Date(),
):Promise<{canWrite:boolean}|null>{
 const [member,unit,link,consents]=await Promise.all([
  tx.membership.findUnique({where:{clerkUserId:input.actorClerkUserId},
   select:{status:true,role:true}}),
  tx.chessBusinessUnit.findUnique({where:{id:input.businessId},
   select:{status:true}}),
  tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
   profileId:input.clientProfileId,businessId:input.businessId,
   service:input.service,
  }},select:{grants:{where:{
   clerkUserId:input.actorClerkUserId,canRead:true,revokedAt:null,
  },select:{canWrite:true}}}}),
  tx.chessClientConsent.findMany({where:{
   businessId:input.businessId,clientProfileId:input.clientProfileId,
   purpose:"service:"+input.service,
  },select:{status:true,expiresAt:true,withdrawnAt:true,
   consentedAt:true,acceptedByClerkUserId:true,
   verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
 ]);
 if(member?.status!=="ACTIVE"||member.role==="VIEWER"||
  unit?.status!=="ACTIVE"||!link?.grants.length||
  !consents.some(c=>isUsableConsent(c,now)))return null;
 const canWrite=link.grants.some(g=>g.canWrite);
 return input.requireWrite&&!canWrite?null:{canWrite};
}
