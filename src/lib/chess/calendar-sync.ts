import {getTenantDb} from "@/lib/db/get-tenant-db";
import {calendarGatewayConfigured,submitCalendarEvent,cancelCalendarEvent} from "./calendar-provider";
import {maySyncCalendar} from "./calendar-preferences";
import {reconcileUncertainChessCalendarEvents} from "./calendar-reconciliation";

/** Drain a bounded tenant-local calendar outbox. Unknown provider outcomes
 * are never retried automatically. A reconciler must query the gateway by
 * idempotency key before requeueing an UNKNOWN event. */
export async function syncChessPendingCalendarEvents(){
 if(!calendarGatewayConfigured())return {disabled:true,examined:0,synced:0,rejected:0,unknown:0,cancelled:0,cancelUnknown:0,reconciliationUnresolved:0};
 const {db,tenantId}=getTenantDb();
 const reconciliation=await reconcileUncertainChessCalendarEvents();
 let cancelled=0,cancelUnknown=0;
 const cancellations=await db.chessCalendarOutbox.findMany({
  where:{status:"CANCEL_PENDING"},take:10,orderBy:{createdAt:"asc"},
 });
 for(const entry of cancellations){
  const claim=await db.chessCalendarOutbox.updateMany({
   where:{id:entry.id,status:"CANCEL_PENDING"},
   data:{status:"CANCEL_SUBMITTING"},
  });
  if(claim.count!==1)continue;
  try{
   if(!entry.providerEventId)throw new Error("Provider event reference missing.");
   const result=await cancelCalendarEvent({
    tenantSlug:tenantId,businessId:entry.businessId,workItemId:entry.workItemId,
    recipientClerkUserId:entry.recipientClerkUserId,providerEventId:entry.providerEventId,
    idempotencyKey:`cancel:${entry.id}`,
   });
   const status=result.status==="accepted"?"CANCELLED" as const:"CANCEL_UNKNOWN" as const;
   await db.$transaction(async tx=>{
    await tx.chessCalendarOutbox.updateMany({
     where:{id:entry.id,status:"CANCEL_SUBMITTING"},data:{
      status,lastErrorCode:status==="CANCEL_UNKNOWN"?"CANCELLATION_REJECTED":null,
     },
    });
    await tx.chessSecurityEvent.create({data:{
     businessId:entry.businessId,action:"CALENDAR_CANCEL_RESULT",
     resourceType:"ChessCalendarOutbox",resourceId:entry.id,
     decision:status==="CANCELLED"?"ALLOW":"REVIEW",
    }});
   });
   if(status==="CANCELLED")cancelled++;else cancelUnknown++;
  }catch{
   await db.chessCalendarOutbox.updateMany({
    where:{id:entry.id,status:"CANCEL_SUBMITTING"},
    data:{status:"CANCEL_UNKNOWN",lastErrorCode:"CANCELLATION_OUTCOME_UNCONFIRMED"},
   });
   cancelUnknown++;
  }
 }
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
   // Serialized with any employee opt-out. If consent or assignment changed
   // after delivery, schedule cancellation rather than leaving a remote event.
   const status=await db.$transaction(async tx=>{
    const [currentPreference,currentTask]=await Promise.all([
     tx.chessCalendarPreference.findUnique({where:{clerkUserId:outbox.recipientClerkUserId},
      select:{enabled:true,acknowledgedAt:true,revokedAt:true}}),
     tx.chessWorkItem.findUnique({where:{id:outbox.workItemId},
      select:{status:true,assignedClerkUserId:true}}),
    ]);
    const stillAllowed=maySyncCalendar(currentPreference)&&!!currentTask&&
     currentTask.assignedClerkUserId===outbox.recipientClerkUserId &&
     currentTask.status!=="CANCELLED"&&currentTask.status!=="COMPLETED";
    const status=remote.status==="rejected"?"REJECTED" as const:
     stillAllowed?"SYNCED" as const:"CANCEL_PENDING" as const;
    const changed=await tx.chessCalendarOutbox.updateMany({
     where:{id:outbox.id,status:"SUBMITTING"},
     data:{status,providerEventId:remote.id},
    });
    if(changed.count!==1)throw new Error("Calendar outbox state changed during delivery.");
    await tx.chessSecurityEvent.create({data:{
     businessId:outbox.businessId,action:"CALENDAR_SYNC_RESULT",
     resourceType:"ChessCalendarOutbox",resourceId:outbox.id,
     decision:status==="SYNCED"?"ALLOW":"REVIEW",
    }});
    return status;
   },{isolationLevel:"Serializable"});
   if(status==="SYNCED")synced++;else if(status==="REJECTED")rejected++;
   else unknown++;
  }catch{
   // No blind retries after uncertain network delivery.
   await db.chessCalendarOutbox.updateMany({
    where:{id:outbox.id,status:"SUBMITTING"},
    data:{status:"UNKNOWN",lastErrorCode:"OUTCOME_UNCONFIRMED"},
   });
   unknown++;
  }
 }
 return {disabled:false,examined:pending.length,synced,rejected,unknown,cancelled,cancelUnknown,
  reconciliationUnresolved:reconciliation.unresolved};
}
