import {getTenantDb} from "@/lib/db/get-tenant-db";
import {maySyncCalendar} from "./calendar-preferences";
import {
 calendarGatewayConfigured,submitAppointmentCalendarEvent,
 cancelAppointmentCalendarEvent,lookupAppointmentCalendarEvent,
} from "./calendar-provider";
import {decideCalendarReconciliation} from "./calendar-reconciliation";

type CalendarDb=ReturnType<typeof getTenantDb>["db"];

async function appointmentAllowed(
 db:CalendarDb,businessId:string,appointmentId:string,recipientClerkUserId:string,
 startsAt:Date,endsAt:Date,
):Promise<{valid:boolean;consent:boolean}>{
 const [appointment,business,membership,assignment,preference]=await Promise.all([
  db.chessAppointment.findFirst({where:{id:appointmentId,businessId},
   select:{status:true,assignedClerkUserId:true,startAt:true,endAt:true}}),
  db.chessBusinessUnit.findUnique({where:{id:businessId},select:{status:true}}),
  db.membership.findUnique({where:{clerkUserId:recipientClerkUserId},
   select:{status:true,role:true}}),
  db.chessEmployeeAssignment.findUnique({where:{businessId_clerkUserId:{
   businessId,clerkUserId:recipientClerkUserId,
  }},select:{revokedAt:true}}),
  db.chessCalendarPreference.findUnique({where:{clerkUserId:recipientClerkUserId},
   select:{enabled:true,acknowledgedAt:true,revokedAt:true}}),
 ]);
 const valid=appointment?.status==="SCHEDULED"&&
  appointment.assignedClerkUserId===recipientClerkUserId&&
  appointment.startAt.getTime()===startsAt.getTime()&&
  appointment.endAt.getTime()===endsAt.getTime()&&
  business?.status==="ACTIVE"&&membership?.status==="ACTIVE"&&
  membership.role!=="VIEWER"&&!!assignment&&!assignment.revokedAt;
 return {valid,consent:maySyncCalendar(preference)};
}

export async function syncChessAppointmentCalendars(){
 if(!calendarGatewayConfigured())return {
  disabled:true,examined:0,synced:0,cancelled:0,unknown:0,
  unresolved:0,rejected:0,
 };
 const {db,tenantId}=getTenantDb();
 let examined=0,synced=0,cancelled=0,unknown=0,unresolved=0,rejected=0;
 // First reconcile previous unknown outcomes. Never blindly resubmit them.
 const uncertain=await db.chessAppointmentCalendarOutbox.findMany({
  where:{status:{in:["UNKNOWN","CANCEL_UNKNOWN"]}},take:20,
  orderBy:{updatedAt:"asc"},
 });
 for(const entry of uncertain){
  if(entry.status!=="UNKNOWN"&&entry.status!=="CANCEL_UNKNOWN")continue;
  examined++;
  try{
   const isCancel=entry.status==="CANCEL_UNKNOWN";
   const remote=await lookupAppointmentCalendarEvent({
    tenantSlug:tenantId,businessId:entry.businessId,appointmentId:entry.appointmentId,
    action:isCancel?"CANCEL":"CREATE",
    providerEventId:entry.providerEventId,
    idempotencyKey:isCancel?`cancel:${entry.id}`:entry.idempotencyKey,
   });
   const access=await appointmentAllowed(db,entry.businessId,entry.appointmentId,
    entry.recipientClerkUserId,entry.startsAt,entry.endsAt);
   const next=decideCalendarReconciliation(entry.status,remote.status,
    access.valid&&access.consent);
   if(!next){unresolved++;continue;}
   const updated=await db.chessAppointmentCalendarOutbox.updateMany({
    where:{id:entry.id,status:entry.status},
    data:{status:next,lastErrorCode:null,
     ...(remote.id?{providerEventId:remote.id}:{})},
   });
   if(updated.count===1){if(next==="SYNCED")synced++;else if(next==="CANCELLED")cancelled++;else rejected++;}
  }catch{unresolved++;}
 }
 // Cancel revoked or cancelled remote events before delivering new ones.
 const cancellations=await db.chessAppointmentCalendarOutbox.findMany({
  where:{status:"CANCEL_PENDING"},take:10,orderBy:{createdAt:"asc"},
 });
 for(const entry of cancellations){
  examined++;
  const claimed=await db.chessAppointmentCalendarOutbox.updateMany({
   where:{id:entry.id,status:"CANCEL_PENDING"},data:{status:"CANCEL_SUBMITTING"},
  });
  if(!claimed.count)continue;
  try{
   if(!entry.providerEventId)throw new Error("Provider event identifier unavailable.");
   const remote=await cancelAppointmentCalendarEvent({
    tenantSlug:tenantId,businessId:entry.businessId,appointmentId:entry.appointmentId,
    recipientClerkUserId:entry.recipientClerkUserId,
    providerEventId:entry.providerEventId,idempotencyKey:`cancel:${entry.id}`,
   });
   const next=remote.status==="accepted"?"CANCELLED":"CANCEL_UNKNOWN";
   await db.chessAppointmentCalendarOutbox.updateMany({
    where:{id:entry.id,status:"CANCEL_SUBMITTING"},
    data:{status:next,lastErrorCode:next==="CANCELLED"?null:"CANCEL_REJECTED"},
   });
   if(next==="CANCELLED")cancelled++;else unknown++;
  }catch{
   await db.chessAppointmentCalendarOutbox.updateMany({
    where:{id:entry.id,status:"CANCEL_SUBMITTING"},
    data:{status:"CANCEL_UNKNOWN",lastErrorCode:"OUTCOME_UNCONFIRMED"},
   });
   unknown++;
  }
 }
 const pending=await db.chessAppointmentCalendarOutbox.findMany({
  where:{status:"PENDING"},take:10,orderBy:{createdAt:"asc"},
 });
 for(const entry of pending){
  examined++;
  const access=await appointmentAllowed(db,entry.businessId,entry.appointmentId,
   entry.recipientClerkUserId,entry.startsAt,entry.endsAt);
  if(!access.valid){
   const changed=await db.chessAppointmentCalendarOutbox.updateMany({
    where:{id:entry.id,status:"PENDING"},
    data:{status:"REJECTED",lastErrorCode:"APPOINTMENT_OR_ACCESS_CHANGED"},
   });
   if(changed.count)rejected++;
   continue;
  }
  if(!access.consent){
   await db.chessAppointmentCalendarOutbox.updateMany({
    where:{id:entry.id,status:"PENDING"},
    data:{status:"WAITING_CONSENT"},
   });
   continue;
  }
  const claimed=await db.chessAppointmentCalendarOutbox.updateMany({
   where:{id:entry.id,status:"PENDING"},data:{status:"SUBMITTING"},
  });
  if(!claimed.count)continue;
  try{
   const remote=await submitAppointmentCalendarEvent({
    tenantSlug:tenantId,businessId:entry.businessId,appointmentId:entry.appointmentId,
    recipientClerkUserId:entry.recipientClerkUserId,
    startsAt:entry.startsAt.toISOString(),endsAt:entry.endsAt.toISOString(),
    summary:"CHESS appointment",visibility:"private",
    idempotencyKey:entry.idempotencyKey,
   });
   const updatedAccess=await appointmentAllowed(db,entry.businessId,entry.appointmentId,
    entry.recipientClerkUserId,entry.startsAt,entry.endsAt);
   const next=remote.status==="rejected"?"REJECTED":
    updatedAccess.valid&&updatedAccess.consent?"SYNCED":"CANCEL_PENDING";
   await db.chessAppointmentCalendarOutbox.updateMany({
    where:{id:entry.id,status:"SUBMITTING"},
    data:{status:next,providerEventId:remote.id,lastErrorCode:null},
   });
   if(next==="SYNCED")synced++;else if(next==="REJECTED")rejected++;else unknown++;
  }catch{
   await db.chessAppointmentCalendarOutbox.updateMany({
    where:{id:entry.id,status:"SUBMITTING"},
    data:{status:"UNKNOWN",lastErrorCode:"OUTCOME_UNCONFIRMED"},
   });
   unknown++;
  }
 }
 return {disabled:false,examined,synced,cancelled,unknown,unresolved,rejected};
}
