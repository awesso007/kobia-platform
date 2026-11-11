import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";

const base={
 documentId:z.string().min(1).max(128),
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX",
  "MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
};
const action=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("LEGAL_HOLD")}).strict(),
 z.object({...base,action:z.literal("SUPPRESS")}).strict(),
 z.object({...base,action:z.literal("SET_RETENTION"),
  retainUntil:z.string().datetime()}).strict(),
]);
export function documentLifecycleEnabled(env?:{
 CHESS_DOCUMENT_LIFECYCLE_ENABLED?:string;
 CHESS_DOCUMENT_RETENTION_POLICY_APPROVED?:string;
}):boolean{
 const flags=env??{
  CHESS_DOCUMENT_LIFECYCLE_ENABLED:process.env.CHESS_DOCUMENT_LIFECYCLE_ENABLED,
  CHESS_DOCUMENT_RETENTION_POLICY_APPROVED:process.env.CHESS_DOCUMENT_RETENTION_POLICY_APPROVED,
 };
 return flags.CHESS_DOCUMENT_LIFECYCLE_ENABLED==="true"&&
  flags.CHESS_DOCUMENT_RETENTION_POLICY_APPROVED==="true";
}
/** No hard deletion or legal-hold release API exists here. A future lawful
 * deletion/release process requires an independently reviewed workflow. */
export async function updateChessDocumentLifecycle(input:unknown){
 const data=action.parse(input);
 if(!documentLifecycleEnabled())throw new PermissionError("record:update");
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||
  !["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");
 const link=await getClientServiceLink(data.clientProfileId,
  data.businessId,data.service);
 if(!link)throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const grant=await db.clientServiceGrant.findFirst({where:{
  linkId:link.id,clerkUserId:actor.clerkUserId,
  canRead:true,canWrite:true,revokedAt:null,
 },select:{id:true}});
 if(!grant)throw new PermissionError("record:update");
 const now=new Date();
 const retain=data.action==="SET_RETENTION"?new Date(data.retainUntil):null;
 if(data.action==="SET_RETENTION"&&
  (!retain||!Number.isFinite(retain.getTime())||
   retain.getTime()<=now.getTime()||
   retain.getTime()>now.getTime()+50*365*86400000))
  throw new RangeError("Retention date outside the approved guardrails.");
 const where={id:data.documentId,businessId:data.businessId,
  clientProfileId:data.clientProfileId,service:data.service};
 return db.$transaction(async tx=>{
  const current=await tx.chessClientDocument.findFirst({
   where,select:{id:true,createdAt:true},
  });
  if(!current)throw new PermissionError("record:update");
  if(retain&&retain<=current.createdAt)
   throw new PermissionError("record:update");
  const next=data.action==="LEGAL_HOLD"?{
   legalHoldAt:now,legalHoldByClerkUserId:actor.clerkUserId,
  }:data.action==="SUPPRESS"?{
   suppressedAt:now,suppressedByClerkUserId:actor.clerkUserId,
  }:{retentionUntil:retain!};
  const guard=data.action==="LEGAL_HOLD"?{legalHoldAt:null}:
   data.action==="SUPPRESS"?{suppressedAt:null}:{retentionUntil:null};
  const changed=await tx.chessClientDocument.updateMany({
   where:{...where,...guard},data:next,
  });
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:data.action==="LEGAL_HOLD"?"DOCUMENT_LEGAL_HOLD_SET":
    data.action==="SUPPRESS"?"DOCUMENT_DOWNLOAD_SUPPRESSED":
    "DOCUMENT_RETENTION_SET",
   resourceType:"ChessClientDocument",resourceId:data.documentId,
   decision:"ALLOW",
  }});
  return {updated:true,action:data.action};
 });
}
