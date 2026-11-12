import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {auditedChessEmployeeRead} from "./sensitive-read-audit";
import {canReadClientProfile} from "@/lib/client-profile/policy";
import {isUsableConsent} from "./onboarding";

const id=z.string().min(1).max(128);
/**
 * A service-case list must NOT read every tenant case into a React page and
 * filter using later transactions: a revoked employee could observe private
 * cross-business/client refs between those reads. The employee assignment,
 * profile ownership, current grant, consent and source audit all share ONE
 * serializable tenant snapshot. Return only the two fields the UI needs.
 *
 * This is coordination visibility, never permission for licensed execution.
 */
export async function listChessAuthorizedRegulatedCases(inputBusinessId:string){
 const businessId=id.parse(inputBusinessId);
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return auditedChessEmployeeRead(db,{
  businessId,actorClerkUserId:actor.clerkUserId,
  action:"REGULATED_CASE_DIRECTORY_READ",resourceType:"ChessServiceCase",
  resourceId:"business:"+businessId,
 },async tx=>{
  const current=await tx.membership.findUnique({
   where:{clerkUserId:actor.clerkUserId},select:{role:true,status:true},
  });
  if(!current||current.status!=="ACTIVE"||current.role==="VIEWER")
   return null;
  const cases=await tx.chessServiceCase.findMany({
   where:{businessId,service:{in:[
    "MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS",
   ]},status:"ACTIVE"},
   select:{id:true,clientProfileId:true,service:true},
   orderBy:{createdAt:"desc"},take:101,
  });
  if(cases.length>100)throw new Error("Regulated case directory exceeds review cap.");
  const visible:Array<{id:string;service:typeof cases[number]["service"]}>=[];
  for(const record of cases){
   const [profile,link,consents]=await Promise.all([
    tx.clientProfile.findUnique({where:{id:record.clientProfileId},
     select:{ownerClerkUserId:true}}),
    tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
     profileId:record.clientProfileId,businessId,service:record.service,
    }},select:{grants:{where:{
     clerkUserId:actor.clerkUserId,canRead:true,revokedAt:null,
    },select:{id:true}}}}),
    tx.chessClientConsent.findMany({where:{
     businessId,clientProfileId:record.clientProfileId,
     purpose:"service:"+record.service,
    },select:{status:true,expiresAt:true,consentedAt:true,
     acceptedByClerkUserId:true,verifiedEmailDigest:true,
     acceptanceEvidenceDigest:true,withdrawnAt:true}}),
   ]);
   if(!profile||!canReadClientProfile({
     clerkUserId:actor.clerkUserId,role:current.role,status:current.status,
    },profile.ownerClerkUserId)||
    !link?.grants.length||!consents.some(consent=>isUsableConsent(consent)))
     continue;
   visible.push({id:record.id,service:record.service});
  }
  return visible;
 });
}
