import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getChessAuditArchiveHealth} from "./audit-archive";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

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
/** Tenant-wide operations metrics are restricted to current owner/admin.
 * Recheck membership within the serializable transaction that reads worker,
 * calendar and archive counts, and commit an opaque allow/deny audit before
 * any data leaves the tenant. No client payloads enter the audit event. */
export async function getChessWorkerHealth(now=new Date()){
 const actor=await getCurrentMembership();
 if(!actor)throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return auditedChessSensitiveRead(db,{
  actorClerkUserId:actor.clerkUserId,
  action:"WORKER_HEALTH_READ",
  resourceType:"ChessWorkerRun",resourceId:"TENANT_WORKERS",
 },async tx=>{
  const member=await tx.membership.findUnique({
   where:{clerkUserId:actor.clerkUserId},select:{status:true,role:true},
  });
  if(member?.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(member.role))
   return null;
  const [runs,activeRecurrences,calendarPending,appointmentCalendarPending,
   appointmentAwaitingConsent,auditArchive]=await Promise.all([
   tx.chessWorkerRun.findMany({orderBy:{occurredAt:"desc"},take:50,
    select:{kind:true,status:true,examined:true,processed:true,blocked:true,occurredAt:true}}),
   tx.chessWorkRecurrence.count({where:{active:true,nextRunAt:{lt:now}}}),
   tx.chessCalendarOutbox.count({where:{
    status:{in:["PENDING","UNKNOWN","CANCEL_PENDING","CANCEL_UNKNOWN"]},
   }}),
   tx.chessAppointmentCalendarOutbox.count({where:{
    status:{in:["PENDING","SUBMITTING","UNKNOWN","CANCEL_PENDING","CANCEL_SUBMITTING","CANCEL_UNKNOWN"]},
   }}),
   tx.chessAppointmentCalendarOutbox.count({where:{status:"WAITING_CONSENT"}}),
   getChessAuditArchiveHealth(tx),
  ]);
  const latest=runs.filter(r=>r.kind==="RECURRING_WORK")[0];
  const stale=!latest||now.getTime()-latest.occurredAt.getTime()>30*60*1000;
  return {runs,auditArchive,activeRecurrences,calendarPending,
   appointmentCalendarPending,appointmentAwaitingConsent,
   schedulerLastSeenAt:latest?.occurredAt??null,schedulerStale:stale};
 });
}
