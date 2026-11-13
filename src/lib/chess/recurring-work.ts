import {createHash,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {nextRecurrenceUtc} from "./recurrence-clock";
import {auditedChessManagerRead} from "./sensitive-read-audit";

export const recurrenceInput=z.object({
 businessId:z.string().min(1).max(128),
 title:z.string().trim().min(2).max(250),
 clientProfileId:z.string().min(1).max(128).optional(),
 assignedClerkUserId:z.string().min(1).max(128).optional(),
 frequency:z.enum(["DAILY","WEEKLY","MONTHLY"]),
 interval:z.number().int().min(1).max(12),
 firstRunAt:z.string().datetime(),
}).strict();

export function isAuthorizedRecurrenceWorker(provided:string):boolean{
 const secret=process.env.CHESS_WORKFLOW_WORKER_TOKEN;
 if(!secret || secret.length<32 || !provided)return false;
 // timingSafeEqual requires fixed-length buffers; hash first.
 return timingSafeEqual(createHash("sha256").update(secret).digest(),
   createHash("sha256").update(provided).digest());
}

export async function createChessRecurrence(input:unknown){
 const data=recurrenceInput.parse(input);
 const actor=await assertBusinessManager(data.businessId);
 const first=new Date(data.firstRunAt);
 const now=Date.now();
 if(first.getTime()<now-30*24*60*60*1000 ||
   first.getTime()>now+365*24*60*60*1000)
   throw new RangeError("First run must be within 30 days past and 365 days ahead.");
 const {db}=getTenantDb();
 if(data.assignedClerkUserId){
  const [assignment,member]=await Promise.all([
   db.chessEmployeeAssignment.findUnique({
    where:{businessId_clerkUserId:{businessId:data.businessId,clerkUserId:data.assignedClerkUserId}},
    select:{revokedAt:true},
   }),
   db.membership.findUnique({where:{clerkUserId:data.assignedClerkUserId},select:{status:true}}),
  ]);
  if(!assignment || assignment.revokedAt || member?.status!=="ACTIVE")
   throw new PermissionError("record:create");
 }
 if(data.clientProfileId){
  // A shared profile by itself does not authorize another company's access.
  const link=await db.clientServiceLink.findFirst({
   where:{businessId:data.businessId,profileId:data.clientProfileId},
   select:{id:true},
  });
  if(!link)throw new PermissionError("record:create");
 }
 const record=await db.chessWorkRecurrence.create({data:{
  businessId:data.businessId,title:data.title,clientProfileId:data.clientProfileId,
  assignedClerkUserId:data.assignedClerkUserId,frequency:data.frequency,
  interval:data.interval,anchorDay:first.getUTCDate(),nextRunAt:first,
  createdByClerkUserId:actor.clerkUserId,
 },select:{id:true,businessId:true,title:true,frequency:true,interval:true,
   nextRunAt:true,active:true,assignedClerkUserId:true,updatedAt:true}});
 return record;
}

export async function listChessRecurrences(businessId:string){
 const actor=await assertBusinessManager(businessId);
 const {db}=getTenantDb();
 return auditedChessManagerRead(db,{
  businessId,actorClerkUserId:actor.clerkUserId,
  action:"RECURRING_WORK_DIRECTORY_READ",resourceType:"ChessWorkRecurrence",
  resourceId:"business:"+businessId,
 },async tx=>tx.chessWorkRecurrence.findMany({
  where:{businessId},orderBy:{nextRunAt:"asc"},take:100,
  select:{id:true,title:true,frequency:true,interval:true,active:true,
   nextRunAt:true,lastRunAt:true,lastInspectedAt:true,assignedClerkUserId:true,updatedAt:true},
 }));
}


export async function setChessRecurrenceActive(
 businessId:string,id:string,active:boolean,expectedUpdatedAt:string,
){
 const actor=await assertBusinessManager(businessId);
 const version=new Date(z.string().datetime().parse(expectedUpdatedAt));
 const {db}=getTenantDb();
 return db.$transaction(async tx=>{
  const updated=await tx.chessWorkRecurrence.updateMany({
   where:{id,businessId,updatedAt:version},
   data:{active,updatedAt:new Date()},
  });
  if(updated.count!==1)return {updated:false};
  await tx.chessSecurityEvent.create({data:{
   businessId,actorClerkUserId:actor.clerkUserId,
   action:active?"RECURRENCE_RESUMED":"RECURRENCE_PAUSED",
   resourceType:"ChessWorkRecurrence",resourceId:id,decision:"ALLOW",
  }});
  return {updated:true};
 });
}

/** Scan at most 25 due templates per run. Sort by last inspection before
 * due date so a revoked assignment or inactive unit cannot starve newer work.
 * The 26th row is only a backlog probe: no work or provider call occurs for it.
 * lastInspectedAt never means an actual task was created. */
export async function runDueChessRecurrences(now=new Date()){
 const {db}=getTenantDb();
 const candidateRows=await db.chessWorkRecurrence.findMany({
  where:{active:true,nextRunAt:{lte:now}},
  orderBy:[{lastInspectedAt:{sort:"asc",nulls:"first"}},
   {nextRunAt:"asc"},{id:"asc"}],take:26,
 });
 const due=candidateRows.slice(0,25);
 const backlog=candidateRows.length>25;
 let generated=0,blocked=0;
 for(const template of due){
  try{
   const result=await db.$transaction(async tx=>{
    // Claim this exact due version and stamp inspection atomically. A second
    // worker cannot create the same task from a stale template snapshot.
    const inspected=await tx.chessWorkRecurrence.updateMany({
     where:{id:template.id,active:true,nextRunAt:template.nextRunAt,
      lastInspectedAt:template.lastInspectedAt},
     data:{lastInspectedAt:now},
    });
    if(inspected.count!==1)return false;
    const business=await tx.chessBusinessUnit.findUnique({
     where:{id:template.businessId},select:{status:true},
    });
    if(business?.status!=="ACTIVE")return false;
    if(template.assignedClerkUserId){
     const [assignment,member]=await Promise.all([
      tx.chessEmployeeAssignment.findUnique({
       where:{businessId_clerkUserId:{
        businessId:template.businessId,clerkUserId:template.assignedClerkUserId,
       }},select:{revokedAt:true},
      }),
      tx.membership.findUnique({where:{clerkUserId:template.assignedClerkUserId},
       select:{status:true}}),
     ]);
     if(!assignment || assignment.revokedAt || member?.status!=="ACTIVE")return false;
    }
    const next=nextRecurrenceUtc(template.nextRunAt,template.frequency,
      template.interval,template.anchorDay);
    const claim=await tx.chessWorkRecurrence.updateMany({
     where:{id:template.id,active:true,nextRunAt:template.nextRunAt,
      lastInspectedAt:now},
     data:{nextRunAt:next,lastRunAt:template.nextRunAt},
    });
    if(claim.count!==1)throw new Error("Recurrence version changed during task creation.");
    const task=await tx.chessWorkItem.create({data:{
     businessId:template.businessId,clientProfileId:template.clientProfileId,
     recurrenceId:template.id,scheduledFor:template.nextRunAt,
     title:template.title,assignedClerkUserId:template.assignedClerkUserId,
     dueAt:template.nextRunAt,
    },select:{id:true}});
    if(template.assignedClerkUserId){
     await tx.chessEmployeeAlert.create({data:{
      businessId:template.businessId,recipientClerkUserId:template.assignedClerkUserId,
      workItemId:task.id,type:"WORK_ASSIGNED",
      message:"A new CHESS work item was assigned to you.",
      dedupeKey:`work:${task.id}:assigned`,
     }});
     await tx.chessCalendarOutbox.create({data:{
      businessId:template.businessId,workItemId:task.id,
      recipientClerkUserId:template.assignedClerkUserId,
      scheduledFor:template.nextRunAt,idempotencyKey:`calendar:${task.id}`,
     }});
    }
    await tx.chessSecurityEvent.create({data:{
     businessId:template.businessId,action:"RECURRENCE_TASK_CREATED",
     resourceType:"ChessWorkItem",resourceId:task.id,decision:"ALLOW",
    }});
    return true;
   });
   if(result)generated++;else blocked++;
  }catch{
   // The task and recurrence advance roll back together. Best-effort
   // inspection stamp prevents a permanently failing template from taking
   // every future bounded window; a failed stamp leaves the original due
   // template eligible for operator investigation rather than mutating work.
   await db.chessWorkRecurrence.updateMany({
    where:{id:template.id,active:true,nextRunAt:template.nextRunAt},
    data:{lastInspectedAt:now},
   }).catch(()=>{});
   blocked++;
  }
 }
 return {examined:due.length,generated,blocked,backlog};
}
