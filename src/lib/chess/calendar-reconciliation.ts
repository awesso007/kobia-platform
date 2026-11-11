import {getTenantDb} from "@/lib/db/get-tenant-db";
import {lookupCalendarEvent,type CalendarLookupStatus} from "./calendar-provider";
import {maySyncCalendar} from "./calendar-preferences";

type UncertainState="UNKNOWN"|"CANCEL_UNKNOWN";
type Decision="SYNCED"|"CANCEL_PENDING"|"CANCELLED"|"REJECTED"|null;

/** A "not found" response does not prove that a pending request never
 * reached the provider. Never silently retry such submissions. */
export function decideCalendarReconciliation(
 state:UncertainState,result:CalendarLookupStatus,employeeStillConsents:boolean,
):Decision {
 if(state==="UNKNOWN"){
  if(result==="accepted")return employeeStillConsents?"SYNCED":"CANCEL_PENDING";
  if(result==="rejected")return "REJECTED";
  return null;
 }
 if(result==="accepted")return "CANCELLED";
 return null;
}

/** Query the approved gateway by immutable idempotency key.
 * Still-unknown deliveries require manual review and are not re-sent. */
export async function reconcileUncertainChessCalendarEvents(){
 const {db,tenantId}=getTenantDb();
 const queued=await db.chessCalendarOutbox.findMany({
  where:{status:{in:["UNKNOWN","CANCEL_UNKNOWN"]}},
  orderBy:{updatedAt:"asc"},take:20,
 });
 let resolved=0,unresolved=0;
 for(const entry of queued){
  // Prisma type inference does not narrow enum unions from findMany filters.
  if(entry.status!=="UNKNOWN"&&entry.status!=="CANCEL_UNKNOWN")continue;
  const isCancel=entry.status==="CANCEL_UNKNOWN";
  try{
   const result=await lookupCalendarEvent({
    tenantSlug:tenantId,businessId:entry.businessId,workItemId:entry.workItemId,
    idempotencyKey:isCancel?`cancel:${entry.id}`:entry.idempotencyKey,
    providerEventId:entry.providerEventId,
    action:isCancel?"CANCEL":"CREATE",
   });
   const [pref,task]=await Promise.all([
    db.chessCalendarPreference.findUnique({where:{
     clerkUserId:entry.recipientClerkUserId,
    },select:{enabled:true,acknowledgedAt:true,revokedAt:true}}),
    db.chessWorkItem.findFirst({where:{id:entry.workItemId,businessId:entry.businessId},
     select:{status:true,assignedClerkUserId:true}}),
   ]);
   const stillValid=maySyncCalendar(pref)&&!!task&&
    task.assignedClerkUserId===entry.recipientClerkUserId &&
    task.status!=="CANCELLED"&&task.status!=="COMPLETED";
   const next=decideCalendarReconciliation(entry.status,result.status,stillValid);
   if(!next){unresolved++;continue;}
   if(result.status==="accepted"&&!isCancel&&!result.id){
    unresolved++;continue;
   }
   await db.$transaction(async tx=>{
    const changed=await tx.chessCalendarOutbox.updateMany({
     where:{id:entry.id,status:entry.status},
     data:{status:next,
      ...(result.id?{providerEventId:result.id}:{}),
      lastErrorCode:null},
    });
    if(changed.count)await tx.chessSecurityEvent.create({data:{
     businessId:entry.businessId,action:"CALENDAR_RECONCILED",
     resourceType:"ChessCalendarOutbox",resourceId:entry.id,
     decision:next==="SYNCED"||next==="CANCELLED"?"ALLOW":"REVIEW",
    }});
   });
   resolved++;
  }catch{
   unresolved++;
  }
 }
 return {examined:queued.length,resolved,unresolved};
}
