import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {assertBusinessManager} from "./business-manager";
import {auditedChessManagerRead} from "./sensitive-read-audit";

/** Only the signed-in recipient can list/read their own in-app alerts.
 * Alert text intentionally excludes sensitive client data. */
export async function listChessEmployeeAlerts(businessId:string){
 await assertBusinessAccess(businessId);
 const member=await getCurrentMembership();
 if(!member||member.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return db.chessEmployeeAlert.findMany({
  where:{businessId,recipientClerkUserId:member.clerkUserId},
  select:{id:true,type:true,message:true,workItemId:true,readAt:true,createdAt:true},
  orderBy:{createdAt:"desc"},take:100,
 });
}

export async function markChessAlertRead(businessId:string,alertId:string){
 await assertBusinessAccess(businessId);
 const member=await getCurrentMembership();
 if(!member||member.status!=="ACTIVE")throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const result=await db.chessEmployeeAlert.updateMany({
  where:{businessId,id:alertId,recipientClerkUserId:member.clerkUserId,readAt:null},
  data:{readAt:new Date()},
 });
 return {updated:result.count===1};
}

/** Manager work queue only. Staff without a MANAGER assignment cannot view
 * other employees' blocked, overdue, or unassigned work. */
export async function getChessManagerQueue(businessId:string,now=new Date()){
 const actor=await assertBusinessManager(businessId);
 const {db}=getTenantDb();
 return auditedChessManagerRead(db,{
  businessId,actorClerkUserId:actor.clerkUserId,
  action:"MANAGER_WORK_QUEUE_READ",resourceType:"ChessWorkItem",
  resourceId:"business:"+businessId,
 },async tx=>{
  const active={businessId,status:{in:["TODO","IN_PROGRESS","BLOCKED"] as
    ("TODO"|"IN_PROGRESS"|"BLOCKED")[]}};
  const [blocked,unassigned,overdue]=await Promise.all([
   tx.chessWorkItem.findMany({
    where:{businessId,status:"BLOCKED"},
    select:{id:true,title:true,status:true,assignedClerkUserId:true,
     dueAt:true,updatedAt:true},
    orderBy:{updatedAt:"asc"},take:50,
   }),
   tx.chessWorkItem.findMany({
    where:{...active,assignedClerkUserId:null},
    select:{id:true,title:true,status:true,assignedClerkUserId:true,
     dueAt:true,updatedAt:true},
    orderBy:{createdAt:"asc"},take:50,
   }),
   tx.chessWorkItem.findMany({
    where:{...active,dueAt:{lt:now}},
    select:{id:true,title:true,status:true,assignedClerkUserId:true,
     dueAt:true,updatedAt:true},
    orderBy:{dueAt:"asc"},take:50,
   }),
  ]);
  return {blocked,unassigned,overdue,asOf:now};
 });
}

const assignment=z.object({
 businessId:z.string().min(1).max(128),
 workItemId:z.string().min(1).max(128),
 clerkUserId:z.string().min(1).max(128),
 expectedUpdatedAt:z.string().datetime(),
}).strict();

export async function assignChessWorkItem(input:unknown){
 const data=assignment.parse(input);
 const actor=await assertBusinessManager(data.businessId);
 const {db}=getTenantDb();
 const [member,unit]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:data.clerkUserId},select:{status:true}}),
  db.chessEmployeeAssignment.findUnique({
   where:{businessId_clerkUserId:{businessId:data.businessId,clerkUserId:data.clerkUserId}},
   select:{revokedAt:true},
  }),
 ]);
 if(member?.status!=="ACTIVE"||!unit||unit.revokedAt)throw new PermissionError("record:update");
 const expected=new Date(data.expectedUpdatedAt);
 return db.$transaction(async tx=>{
  const existing=await tx.chessWorkItem.findFirst({
   where:{id:data.workItemId,businessId:data.businessId},
   select:{updatedAt:true,status:true,dueAt:true},
  });
  if(!existing || existing.updatedAt.getTime()!==expected.getTime() ||
    existing.status==="COMPLETED"||existing.status==="CANCELLED"){
   return {updated:false,reason:"CONFLICT" as const};
  }
  const calendar=await tx.chessCalendarOutbox.findUnique({
   where:{workItemId:data.workItemId},
   select:{status:true,recipientClerkUserId:true},
  });
  if(calendar && calendar.recipientClerkUserId!==data.clerkUserId &&
    calendar.status!=="PENDING") {
   // Do not silently move already-submitted or uncertain remote events.
   return {updated:false,reason:"CONFLICT" as const};
  }
  const now=new Date();
  const changed=await tx.chessWorkItem.updateMany({
   where:{id:data.workItemId,businessId:data.businessId,updatedAt:expected,
    status:{in:["TODO","IN_PROGRESS","BLOCKED"]}},
   data:{assignedClerkUserId:data.clerkUserId,updatedAt:now},
  });
  if(changed.count!==1)return {updated:false,reason:"CONFLICT" as const};
  if(existing.dueAt){
   if(calendar?.status==="PENDING"){
    await tx.chessCalendarOutbox.update({
     where:{workItemId:data.workItemId},
     data:{recipientClerkUserId:data.clerkUserId},
    });
   }else if(!calendar){
    await tx.chessCalendarOutbox.create({data:{
     businessId:data.businessId,workItemId:data.workItemId,
     recipientClerkUserId:data.clerkUserId,scheduledFor:existing.dueAt,
     idempotencyKey:`calendar:${data.workItemId}`,
    }});
   }
  }
  await tx.chessEmployeeAlert.create({data:{
   businessId:data.businessId,recipientClerkUserId:data.clerkUserId,
   workItemId:data.workItemId,type:"WORK_ASSIGNED",
   message:"A CHESS work item has been assigned to you.",
   dedupeKey:`work:${data.workItemId}:assigned:${now.toISOString()}`,
  }});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"WORK_ITEM_ASSIGNED",resourceType:"ChessWorkItem",
   resourceId:data.workItemId,decision:"ALLOW",
  }});
  return {updated:true,updatedAt:now};
 });
}
