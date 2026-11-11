import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {isAllowedWorkTransition} from "./work-item-transitions";

const input=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128).optional(),
 title:z.string().trim().min(2).max(250),
 assignedClerkUserId:z.string().min(1).max(128).optional(),
 dueAt:z.coerce.date().optional(),
}).strict();

export async function createChessWorkItem(data:unknown) {
 const parsed=input.parse(data);
 await assertBusinessAccess(parsed.businessId);
 const actor=await getCurrentMembership();
 if (!actor || !["OWNER","ADMIN","MEMBER"].includes(actor.role)) throw new PermissionError("record:create");
 const {db}=getTenantDb();
 if (parsed.assignedClerkUserId) {
  const assigned=await db.chessEmployeeAssignment.findUnique({
   where:{businessId_clerkUserId:{businessId:parsed.businessId,clerkUserId:parsed.assignedClerkUserId}},
   select:{revokedAt:true},
  });
  const member=await db.membership.findUnique({where:{clerkUserId:parsed.assignedClerkUserId},select:{status:true}});
  if (!assigned || assigned.revokedAt || member?.status!=="ACTIVE") throw new PermissionError("record:create");
 }
 if (parsed.clientProfileId) {
  // A shared CRM profile is not permission to use it across CHESS businesses.
  const link=await db.clientServiceLink.findFirst({
   where:{profileId:parsed.clientProfileId,businessId:parsed.businessId},
   select:{id:true},
  });
  if(!link)throw new PermissionError("record:read");
 }
 return db.$transaction(async tx=>{
  const item=await tx.chessWorkItem.create({data:parsed,select:{
   id:true,businessId:true,title:true,status:true,assignedClerkUserId:true,dueAt:true,updatedAt:true,
  }});
  if(parsed.assignedClerkUserId){
   await tx.chessEmployeeAlert.create({data:{
    businessId:parsed.businessId,recipientClerkUserId:parsed.assignedClerkUserId,
    workItemId:item.id,type:"WORK_ASSIGNED",
    message:"A CHESS work item has been assigned to you.",
    dedupeKey:`work:${item.id}:assigned`,
   }});
  }
  if(parsed.dueAt && parsed.assignedClerkUserId){
   await tx.chessCalendarOutbox.create({data:{
    businessId:parsed.businessId,workItemId:item.id,
    recipientClerkUserId:parsed.assignedClerkUserId,scheduledFor:parsed.dueAt,
    idempotencyKey:`calendar:${item.id}`,
   }});
  }
  await tx.chessSecurityEvent.create({data:{
   businessId:parsed.businessId,actorClerkUserId:actor.clerkUserId,
   action:"WORK_ITEM_CREATED",resourceType:"ChessWorkItem",resourceId:item.id,decision:"ALLOW",
  }});
  return item;
 });
}
export async function listChessWorkItems(businessId:string) {
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if (!actor) throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return db.chessWorkItem.findMany({
  where:{businessId,...(!["OWNER","ADMIN"].includes(actor.role)&&{assignedClerkUserId:actor.clerkUserId})},
  select:{id:true,title:true,status:true,dueAt:true,assignedClerkUserId:true,updatedAt:true},
  take:100,orderBy:{createdAt:"desc"},
 });
}


export class WorkItemConflictError extends Error {
 constructor(){super("Work item changed since it was last loaded.");this.name="WorkItemConflictError";}
}
const statusInput=z.object({
 id:z.string().min(1).max(128),
 businessId:z.string().min(1).max(128),
 status:z.enum(["TODO","IN_PROGRESS","BLOCKED","COMPLETED","CANCELLED"]),
 expectedUpdatedAt:z.string().datetime(),
}).strict();

/** Optimistic update prevents overwriting another employee's changes.
 * The audit event commits atomically with the state transition. */
export async function transitionChessWorkItem(data:unknown){
 const parsed=statusInput.parse(data);
 await assertBusinessAccess(parsed.businessId);
 const actor=await getCurrentMembership();
 if(!actor || actor.status!=="ACTIVE")throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const existing=await db.chessWorkItem.findFirst({
  where:{id:parsed.id,businessId:parsed.businessId},
  select:{id:true,status:true,updatedAt:true,assignedClerkUserId:true},
 });
 if(!existing)throw new PermissionError("record:update");
 if(!["OWNER","ADMIN"].includes(actor.role) && existing.assignedClerkUserId!==actor.clerkUserId)
  throw new PermissionError("record:update");
 const version=new Date(parsed.expectedUpdatedAt);
 if(existing.updatedAt.getTime()!==version.getTime())throw new WorkItemConflictError();
 if(!isAllowedWorkTransition(existing.status,parsed.status))
  throw new PermissionError("record:update");
 const now=new Date();
 return db.$transaction(async tx=>{
  const changed=await tx.chessWorkItem.updateMany({
   where:{id:existing.id,businessId:parsed.businessId,status:existing.status,updatedAt:version},
   data:{status:parsed.status,updatedAt:now,
    completedAt:parsed.status==="COMPLETED"?now:null},
  });
  if(changed.count!==1)throw new WorkItemConflictError();
  if(parsed.status==="CANCELLED"){
   // Pending calendar pushes were never sent. Already-synced events require
   // an explicit remote cancellation workflow before any further changes.
   await tx.chessCalendarOutbox.updateMany({
    where:{workItemId:existing.id,status:{in:["PENDING","WAITING_CONSENT"]}},
    data:{status:"CANCELLED"},
   });
   await tx.chessCalendarOutbox.updateMany({
    where:{workItemId:existing.id,status:"SYNCED"},
    data:{status:"CANCEL_PENDING"},
   });
  }
  await tx.chessSecurityEvent.create({data:{
   businessId:parsed.businessId,actorClerkUserId:actor.clerkUserId,
   action:"WORK_ITEM_STATUS_CHANGED",resourceType:"ChessWorkItem",
   resourceId:existing.id,decision:"ALLOW",
  }});
  return {id:existing.id,status:parsed.status,updatedAt:now};
 });
}
