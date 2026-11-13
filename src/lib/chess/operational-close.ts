import {createHash} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {getChessOperationsReport,reportWindow} from "./operations-reporting";

const business=z.string().min(1).max(128);
const month=z.string().regex(/^20[2-9][0-9]-(0[1-9]|1[0-2])$/);
const request=z.object({businessId:business,month}).strict();
const approval=z.object({businessId:business,snapshotId:business}).strict();

export function closedOperationalMonth(value:string,now=new Date()):boolean{
 const {to}=reportWindow(value);
 return to<=now;
}
export function operationalSnapshotDigest(input:{
 tenantSlug:string;businessId:string;month:string;reportJson:string,
}):string{
 return createHash("sha256").update(JSON.stringify({
  purpose:"CHESS_M7_OPERATIONAL_SNAPSHOT_V1",...input,
 })).digest("hex");
}
export function independentOperationalReviewer(
 requestedBy:string,reviewer:string,role:string,
):boolean{
 return requestedBy!==reviewer&&["OWNER","ADMIN"].includes(role);
}
async function reviewer(businessId:string){
 const actor=await assertBusinessManager(businessId);
 if(actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:read");
 return actor;
}
/** Bounded immutable evidence of operational counts AS THEY WERE at snapshot
 * creation. NOT a GAAP financial close, an accounts receivable settlement,
 * cash receipt, tax return, or legally consolidated financial statement.
 * Current workflow statuses may have changed after the reporting month. */
export async function snapshotChessOperations(input:unknown){
 const data=request.parse(input);
 const actor=await reviewer(data.businessId);
 if(!closedOperationalMonth(data.month))
  throw new PermissionError("record:create");
 const report=await getChessOperationsReport(data);
 const reportJson=JSON.stringify({
  ...report,
  snapshotNotice:"Frozen operational activity counts, current workflow states at snapshot time. NOT a GAAP close, cash collection or multi-entity consolidation.",
 });
 if(reportJson.length>65536)
  throw new Error("Operational report exceeds bounded snapshot cap.");
 const {db,tenantId}=getTenantDb();
 const digest=operationalSnapshotDigest({
  tenantSlug:tenantId,businessId:data.businessId,
  month:data.month,reportJson,
 });
 return db.$transaction(async tx=>{
  const record=await tx.chessOperationalPeriodSnapshot.create({data:{
   businessId:data.businessId,month:data.month,
   reportJson,sourceDigest:digest,createdByClerkUserId:actor.clerkUserId,
  },select:{id:true,status:true,month:true,createdAt:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"OPERATIONS_PERIOD_SNAPSHOT_CREATED",
   resourceType:"ChessOperationalPeriodSnapshot",resourceId:record.id,
   decision:"REVIEW",
  }});
  return record;
 });
}
/** Independent reviewer only attests the fixed operational evidence, not
 * the validity of statutory financial statements or external cash balances. */
export async function reviewChessOperationsSnapshot(input:unknown){
 const data=approval.parse(input);
 const actor=await reviewer(data.businessId);
 const {db,tenantId}=getTenantDb();
 const snapshot=await db.chessOperationalPeriodSnapshot.findFirst({where:{
  id:data.snapshotId,businessId:data.businessId,status:"PENDING",
 }});
 if(!snapshot||!independentOperationalReviewer(
  snapshot.createdByClerkUserId,actor.clerkUserId,actor.role))
  throw new PermissionError("record:update");
 const current=operationalSnapshotDigest({
  tenantSlug:tenantId,businessId:data.businessId,
  month:snapshot.month,reportJson:snapshot.reportJson,
 });
 if(current!==snapshot.sourceDigest)
  throw new PermissionError("record:update");
 return db.$transaction(async tx=>{
  const changed=await tx.chessOperationalPeriodSnapshot.updateMany({
   where:{id:snapshot.id,businessId:data.businessId,
    status:"PENDING",sourceDigest:current},
   data:{status:"APPROVED",reviewedByClerkUserId:actor.clerkUserId,
    reviewedAt:new Date()},
  });
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"OPERATIONS_PERIOD_SNAPSHOT_REVIEWED",
   resourceType:"ChessOperationalPeriodSnapshot",resourceId:snapshot.id,
   decision:"ALLOW",
  }});
  return {id:snapshot.id,status:"APPROVED" as const};
 });
}
export async function listChessOperationalSnapshots(businessId:string){
 const id=business.parse(businessId);
 const actor=await reviewer(id);
 const {db}=getTenantDb();
 const snapshots=await db.chessOperationalPeriodSnapshot.findMany({
  where:{businessId:id},orderBy:{createdAt:"desc"},take:100,
  select:{id:true,businessId:true,month:true,sourceDigest:true,
   status:true,createdAt:true,reviewedAt:true,
   createdByClerkUserId:true,reviewedByClerkUserId:true},
 });
 return snapshots.map(({createdByClerkUserId,...s})=>({
  ...s,mayReview:s.status==="PENDING"&&
   independentOperationalReviewer(createdByClerkUserId,actor.clerkUserId,actor.role),
 }));
}
/** Report export must use the pinned evidence, not recalculate historical
 * counts based on subsequently edited workflow statuses. */
export async function getChessOperationalSnapshotEvidence(businessId:string,monthValue:string){
 const id=business.parse(businessId),m=month.parse(monthValue);
 await reviewer(id);
 const {db,tenantId}=getTenantDb();
 const record=await db.chessOperationalPeriodSnapshot.findUnique({
  where:{businessId_month:{businessId:id,month:m}},
  select:{month:true,reportJson:true,sourceDigest:true,status:true,createdAt:true},
 });
 if(!record)return null;
 const digest=operationalSnapshotDigest({tenantSlug:tenantId,businessId:id,
  month:m,reportJson:record.reportJson});
 if(digest!==record.sourceDigest)throw new PermissionError("record:read");
 return {month:record.month,status:record.status,sourceDigest:digest,
  createdAt:record.createdAt.toISOString(),
  report:JSON.parse(record.reportJson) as unknown};
}
