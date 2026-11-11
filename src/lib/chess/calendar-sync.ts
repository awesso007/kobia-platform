import {getTenantDb} from "@/lib/db/get-tenant-db";
import {calendarGatewayConfigured,submitCalendarEvent} from "./calendar-provider";
import {maySyncCalendar} from "./calendar-preferences";

/** Drain a bounded tenant-local calendar outbox. Unknown provider outcomes
 * are never retried automatically. A reconciler must query the gateway by
 * idempotency key before requeueing an UNKNOWN event. */
export async function syncChessPendingCalendarEvents(){
 if(!calendarGatewayConfigured())return {disabled:true,examined:0,synced:0,rejected:0,unknown:0};
 const {db,tenantId}=getTenantDb();
 const pending=await db.chessCalendarOutbox.findMany({
  where:{status:"PENDING"},orderBy:{createdAt:"asc"},take:10,
 });
 let synced=0,rejected=0,unknown=0;
 for(const outbox of pending){
  const [task,business,member,assignment,preference]=await Promise.all([
   db.chessWorkItem.findFirst({
    where:{id:outbox.workItemId,businessId:outbox.businessId},
    select:{status:true,dueAt:true,assignedClerkUserId:true},
   }),
   db.chessBusinessUnit.findUnique({where:{id:outbox.businessId},select:{status:true}}),
   db.membership.findUnique({where:{clerkUserId:outbox.recipientClerkUserId},select:{status:true}}),
   db.chessEmployeeAssignment.findUnique({where:{businessId_clerkUserId:{
    businessId:outbox.businessId,clerkUserId:outbox.recipientClerkUserId,
   }},select:{revokedAt:true}}),
   db.chessCalendarPreference.findUnique({
    where:{clerkUserId:outbox.recipientClerkUserId},
    select:{enabled:true,acknowledgedAt:true,revokedAt:true},
   }),
  ]);
  const valid=business?.status==="ACTIVE"&&member?.status==="ACTIVE"&&
   !!assignment&&!assignment.revokedAt&&!!task&&
   task.status!=="CANCELLED"&&task.status!=="COMPLETED"&&
   task.assignedClerkUserId===outbox.recipientClerkUserId &&
   task.dueAt?.getTime()===outbox.scheduledFor.getTime();
  if(!valid){
   const changed=await db.chessCalendarOutbox.updateMany({
    where:{id:outbox.id,status:"PENDING"},data:{status:"REJECTED",lastErrorCode:"ACCESS_OR_TASK_CHANGED"},
   });
   if(changed.count)rejected++;
   continue;
  }
  if(!maySyncCalendar(preference)){
   await db.chessCalendarOutbox.updateMany({
    where:{id:outbox.id,status:"PENDING"},data:{status:"WAITING_CONSENT"},
   });
   continue;
  }
  const claim=await db.chessCalendarOutbox.updateMany({
   where:{id:outbox.id,status:"PENDING"},data:{status:"SUBMITTING"},
  });
  if(claim.count!==1)continue;
  try{
   const remote=await submitCalendarEvent({
    tenantSlug:tenantId,businessId:outbox.businessId,workItemId:outbox.workItemId,
    recipientClerkUserId:outbox.recipientClerkUserId,
    startsAt:outbox.scheduledFor.toISOString(),
    endsAt:new Date(outbox.scheduledFor.getTime()+30*60*1000).toISOString(),
    summary:"CHESS work item",visibility:"private",
    idempotencyKey:outbox.idempotencyKey,
   });
   const status=remote.status==="accepted"?"SYNCED" as const:"REJECTED" as const;
   await db.$transaction(async tx=>{
    await tx.chessCalendarOutbox.updateMany({
     where:{id:outbox.id,status:"SUBMITTING"},
     data:{status,providerEventId:remote.id},
    });
    await tx.chessSecurityEvent.create({data:{
     businessId:outbox.businessId,action:"CALENDAR_SYNC_RESULT",
     resourceType:"ChessCalendarOutbox",resourceId:outbox.id,
     decision:status==="SYNCED"?"ALLOW":"DENY",
    }});
   });
   if(status==="SYNCED")synced++;else rejected++;
  }catch{
   // No blind retries after uncertain network delivery.
   await db.chessCalendarOutbox.updateMany({
    where:{id:outbox.id,status:"SUBMITTING"},
    data:{status:"UNKNOWN",lastErrorCode:"OUTCOME_UNCONFIRMED"},
   });
   unknown++;
  }
 }
 return {disabled:false,examined:pending.length,synced,rejected,unknown};
}
