import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getChessAuditArchiveHealth} from "./audit-archive";

type Kind="RECURRING_WORK"|"CALENDAR_SYNC"|"AI_TRIAGE";
export function classifyWorkerRun(processed:number,blocked:number,failed=false):
 "SUCCESS"|"DEGRADED"|"FAILED" {
 if(failed)return "FAILED";
 return blocked>0?"DEGRADED":"SUCCESS";
}
/** Machine-written operational telemetry, no client names or payloads. */
export async function recordChessWorkerRun(
 kind:Kind,data:{examined:number;processed:number;blocked:number;failed?:boolean},
){
 const {db}=getTenantDb();
 return db.chessWorkerRun.create({data:{
  kind,status:classifyWorkerRun(data.processed,data.blocked,data.failed),
  examined:data.examined,processed:data.processed,blocked:data.blocked,
 },select:{id:true,status:true}});
}
/** Tenant-wide operations metrics are restricted to owner and admin.
 * Business managers never see aggregate data from unrelated units. */
export async function getChessWorkerHealth(now=new Date()){
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||
  !["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const [runs,activeRecurrences,calendarPending,appointmentCalendarPending,appointmentAwaitingConsent]=await Promise.all([
  db.chessWorkerRun.findMany({orderBy:{occurredAt:"desc"},take:50,
   select:{kind:true,status:true,examined:true,processed:true,blocked:true,occurredAt:true}}),
  db.chessWorkRecurrence.count({where:{active:true,nextRunAt:{lt:now}}}),
  db.chessCalendarOutbox.count({where:{
   status:{in:["PENDING","UNKNOWN","CANCEL_PENDING","CANCEL_UNKNOWN"]},
  }}),
  db.chessAppointmentCalendarOutbox.count({where:{
   status:{in:["PENDING","SUBMITTING","UNKNOWN","CANCEL_PENDING","CANCEL_SUBMITTING","CANCEL_UNKNOWN"]},
  }}),
  db.chessAppointmentCalendarOutbox.count({where:{status:"WAITING_CONSENT"}}),
 ]);
 const auditArchive=await getChessAuditArchiveHealth();
 const latest=runs.filter(r=>r.kind==="RECURRING_WORK")[0];
 const stale=!latest||now.getTime()-latest.occurredAt.getTime()>30*60*1000;
 return {runs,auditArchive,activeRecurrences,calendarPending,
  appointmentCalendarPending,appointmentAwaitingConsent,
  schedulerLastSeenAt:latest?.occurredAt??null,schedulerStale:stale};
}
