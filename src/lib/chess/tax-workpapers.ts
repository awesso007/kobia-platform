import {createHash} from "node:crypto";
import {z} from "zod";
import {db as ledger} from "@/lib/db";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {assertBusinessManager} from "./business-manager";
import {isUsableConsent} from "./onboarding";

const createSchema=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 taxYear:z.number().int().min(2000).max(2100),
 startAt:z.string().datetime(),
 endAt:z.string().datetime(),
}).strict();
const reviewSchema=z.object({
 businessId:z.string().min(1).max(128),
 workpaperId:z.string().min(1).max(128),
 decision:z.enum(["REVIEWED","APPROVED"]),
 expectedUpdatedAt:z.string().datetime(),
}).strict();

export type LedgerTaxEntry={
 id:string;entryDate:Date;postedAt:Date|null;
 lines:{accountId:string;debitCents:bigint;creditCents:bigint}[];
};
export function taxSnapshotDigest(rows:readonly LedgerTaxEntry[],tenantId:string,entityId:string,
 startAt:Date,endAt:Date):string{
 const list=rows.map(row=>({
  id:row.id,date:row.entryDate.toISOString(),postedAt:row.postedAt?.toISOString()??null,
  lines:row.lines.map(l=>({accountId:l.accountId,
   debit:l.debitCents.toString(),credit:l.creditCents.toString()}))
   .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
 })).sort((a,b)=>a.id.localeCompare(b.id));
 return createHash("sha256").update(JSON.stringify({
  tenantId,entityId,startAt:startAt.toISOString(),endAt:endAt.toISOString(),list,
 })).digest("hex");
}
export function isBalancedTaxSnapshot(rows:readonly LedgerTaxEntry[]):boolean{
 return rows.every(row=>row.lines.length>=2&&
  row.lines.every(l=>l.debitCents>=0n&&l.creditCents>=0n&&
   (l.debitCents===0n)!==(l.creditCents===0n))&&
  row.lines.reduce((sum,l)=>sum+l.debitCents-l.creditCents,0n)===0n);
}
async function fetchTaxLedger(tenantId:string,entityId:string,startAt:Date,endAt:Date){
 // Never silently truncate the fiscal snapshot and present it as complete.
 const rows=await ledger.journalEntry.findMany({
  where:{tenantId,entityId,status:"POSTED",entryDate:{gte:startAt,lt:endAt}},
  orderBy:{id:"asc"},take:5001,select:{
   id:true,entryDate:true,postedAt:true,
   lines:{select:{accountId:true,debitCents:true,creditCents:true}},
  },
 });
 if(rows.length>5000)throw new Error("Tax snapshot exceeds the bounded review limit.");
 if(!isBalancedTaxSnapshot(rows))throw new Error("Unbalanced posted ledger entries cannot be approved.");
 return {digest:taxSnapshotDigest(rows,tenantId,entityId,startAt,endAt),count:rows.length};
}
async function usableTaxCase(businessId:string,clientProfileId:string,serviceCaseId:string){
 const actor=await assertBusinessManager(businessId);
 const grant=await getClientServiceLink(clientProfileId,businessId,"TAX");
 if(!grant)throw new PermissionError("record:read");
 const {db,tenantId}=getTenantDb();
 const [serviceCase,consents,tenant]=await Promise.all([
  db.chessServiceCase.findFirst({where:{id:serviceCaseId,businessId,
   clientProfileId,service:"TAX",status:"ACTIVE"},select:{id:true}}),
  db.chessClientConsent.findMany({where:{businessId,clientProfileId,purpose:"service:TAX"},
   select:{status:true,expiresAt:true,consentedAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
  getTenantBySlug(tenantId),
 ]);
 if(!serviceCase||!consents.some(consent=>isUsableConsent(consent))||!tenant)
  throw new PermissionError("record:read");
 const mapping=await db.chessFinancialLink.findUnique({where:{serviceCaseId},
  select:{legacyTenantId:true,legacyEntityId:true,businessId:true,clientProfileId:true,service:true}});
 if(!mapping || mapping.businessId!==businessId || mapping.clientProfileId!==clientProfileId||
  mapping.service!=="TAX"||mapping.legacyTenantId!==tenant.id)
  throw new PermissionError("record:read");
 const entity=await ledger.entity.findFirst({where:{
  id:mapping.legacyEntityId,tenantId:tenant.id,isActive:true,
 },select:{id:true}});
 if(!entity)throw new PermissionError("record:read");
 return {actor,db,tenantId:tenant.id,entityId:entity.id};
}
/** Snapshot is a bookkeeping evidence manifest, NOT a tax return, filing,
 * professional tax computation or IRS-authorized electronic signature. */
export async function createChessTaxWorkpaper(value:unknown){
 const data=createSchema.parse(value);
 const startAt=new Date(data.startAt),endAt=new Date(data.endAt);
 const days=(endAt.getTime()-startAt.getTime())/86400000;
 if(!Number.isFinite(days)||days<28||days>367||
  startAt.getUTCFullYear()!==data.taxYear)
  throw new RangeError("Invalid tax workpaper period.");
 const state=await usableTaxCase(data.businessId,data.clientProfileId,data.serviceCaseId);
 const snapshot=await fetchTaxLedger(state.tenantId,state.entityId,startAt,endAt);
 return state.db.$transaction(async tx=>{
  const row=await tx.chessTaxWorkpaper.create({data:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   serviceCaseId:data.serviceCaseId,legacyTenantId:state.tenantId,
   legacyEntityId:state.entityId,taxYear:data.taxYear,startAt,endAt,
   snapshotDigest:snapshot.digest,sourceEntryCount:snapshot.count,
   createdByClerkUserId:state.actor.clerkUserId,
  },select:{id:true,status:true,taxYear:true,sourceEntryCount:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
   action:"TAX_WORKPAPER_SNAPSHOT_CREATED",resourceType:"ChessTaxWorkpaper",
   resourceId:row.id,decision:"REVIEW",
  }});
  return row;
 });
}
export function taxReviewSeparation(item:{
 status:string;createdByClerkUserId:string;reviewedByClerkUserId:string|null;
},reviewer:string,role:string,decision:"REVIEWED"|"APPROVED"):boolean{
 if(item.createdByClerkUserId===reviewer)return false;
 if(decision==="REVIEWED")return item.status==="DRAFT";
 return item.status==="REVIEWED"&&item.reviewedByClerkUserId!==reviewer&&
  (role==="OWNER"||role==="ADMIN");
}
export async function reviewChessTaxWorkpaper(input:unknown){
 const data=reviewSchema.parse(input);
 const actor=await getCurrentMembership();
 if(!actor || actor.status!=="ACTIVE")throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const row=await db.chessTaxWorkpaper.findFirst({where:{
  id:data.workpaperId,businessId:data.businessId,
 }});
 if(!row || row.updatedAt.getTime()!==new Date(data.expectedUpdatedAt).getTime()||
  !taxReviewSeparation(row,actor.clerkUserId,actor.role,data.decision))
  throw new PermissionError("record:update");
 const state=await usableTaxCase(row.businessId,row.clientProfileId,row.serviceCaseId);
 const fresh=await fetchTaxLedger(state.tenantId,state.entityId,row.startAt,row.endAt);
 const stale=fresh.digest!==row.snapshotDigest||fresh.count!==row.sourceEntryCount;
 const now=new Date();
 return db.$transaction(async tx=>{
  const changed=await tx.chessTaxWorkpaper.updateMany({where:{
   id:row.id,businessId:data.businessId,status:row.status,updatedAt:row.updatedAt,
  },data:stale?{status:"SUPERSEDED"}:data.decision==="REVIEWED"?{
   status:"REVIEWED",reviewedByClerkUserId:actor.clerkUserId,reviewedAt:now,
  }:{
   status:"APPROVED",approvedByClerkUserId:actor.clerkUserId,approvedAt:now,
  }});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:stale?"TAX_WORKPAPER_SUPERSEDED":"TAX_WORKPAPER_"+data.decision,
   resourceType:"ChessTaxWorkpaper",resourceId:row.id,
   decision:stale?"DENY":"REVIEW",
  }});
  return {id:row.id,status:stale?"SUPERSEDED":data.decision,
   filedWithTaxAuthority:false};
 });
}
export async function listChessTaxWorkpapers(businessId:string,clientProfileId:string,serviceCaseId:string){
 const state=await usableTaxCase(businessId,clientProfileId,serviceCaseId);
 return state.db.chessTaxWorkpaper.findMany({where:{
  businessId,clientProfileId,serviceCaseId,legacyTenantId:state.tenantId,
 },orderBy:{createdAt:"desc"},take:100,select:{
  id:true,taxYear:true,startAt:true,endAt:true,sourceEntryCount:true,
  status:true,createdAt:true,updatedAt:true,
 }});
}
