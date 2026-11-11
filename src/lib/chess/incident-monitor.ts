import {timingSafeEqual} from "node:crypto";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {assertAuthorizedWorkflowTenant} from "./worker-authorization";

/** Dedicated read-only monitoring credential, never a tenant Clerk cookie or
 * the powerful scheduling/scan worker token. External monitor owns paging. */
export function incidentMonitorAuthorized(authorization:string|null,
 env:{CHESS_INCIDENT_MONITOR_ENABLED?:string;CHESS_INCIDENT_MONITOR_TOKEN?:string;
 CHESS_INCIDENT_MONITOR_OPS_APPROVED?:string;
 CHESS_WORKFLOW_WORKER_TOKEN?:string;}=process.env,
):boolean{
 if(env.CHESS_INCIDENT_MONITOR_ENABLED!=="true"||
  env.CHESS_INCIDENT_MONITOR_OPS_APPROVED!=="true"||!authorization||
  !env.CHESS_INCIDENT_MONITOR_TOKEN||
  env.CHESS_INCIDENT_MONITOR_TOKEN.length<32||
  (env.CHESS_WORKFLOW_WORKER_TOKEN!==undefined&&
   env.CHESS_INCIDENT_MONITOR_TOKEN===env.CHESS_WORKFLOW_WORKER_TOKEN))
  return false;
 const a=Buffer.from(authorization,"utf8");
 const b=Buffer.from("Bearer "+env.CHESS_INCIDENT_MONITOR_TOKEN,"utf8");
 return a.length===b.length&&timingSafeEqual(a,b);
}
export type IncidentSignal="SCHEDULER_STALE"|"WORKER_FAILED"|
 "AUDIT_ARCHIVE_UNDELIVERED"|"CONSENT_CALENDAR_BACKLOG";
export function incidentSignalCodes(input:{
 schedulerLastSeenAt:Date|null;latestWorkerStatus:string|null;
 overdueSchedules:number;archiveUnknown:number;archiveRejected:number;
 archiveOldPending:number;calendarOldPending:number;
},now=new Date()):IncidentSignal[]{
 const signals:IncidentSignal[]=[];
 if(!input.schedulerLastSeenAt||
  now.getTime()-input.schedulerLastSeenAt.getTime()>30*60_000)
  signals.push("SCHEDULER_STALE");
 if(input.latestWorkerStatus==="FAILED"||input.overdueSchedules>20)
  signals.push("WORKER_FAILED");
 if(input.archiveUnknown>0||input.archiveRejected>0||input.archiveOldPending>0)
  signals.push("AUDIT_ARCHIVE_UNDELIVERED");
 if(input.calendarOldPending>25)
  signals.push("CONSENT_CALENDAR_BACKLOG");
 return signals;
}
/** No client names, provider keys or raw security events leave this
 * read-only monitoring endpoint. A DB outage is returned as 503. */
export async function getChessIncidentHealth(now=new Date()){
 assertAuthorizedWorkflowTenant(false);
 const {db}=getTenantDb();
 const cutoff=new Date(now.getTime()-30*60_000);
 const [latest,overdue,archiveUnknown,archiveRejected,archiveOldPending,
  calendarOldPending]=await Promise.all([
  db.chessWorkerRun.findFirst({orderBy:{occurredAt:"desc"},
   select:{status:true,occurredAt:true}}),
  db.chessWorkRecurrence.count({where:{active:true,nextRunAt:{lt:cutoff}}}),
  db.chessAuditArchiveOutbox.count({where:{status:"UNKNOWN"}}),
  db.chessAuditArchiveOutbox.count({where:{status:"REJECTED"}}),
  db.chessAuditArchiveOutbox.count({where:{
   status:{in:["PENDING","SUBMITTING"]},createdAt:{lt:cutoff},
  }}),
  db.chessAppointmentCalendarOutbox.count({where:{
   status:{in:["UNKNOWN","CANCEL_UNKNOWN","CANCEL_PENDING"]},
   createdAt:{lt:cutoff},
  }}),
 ]);
 const signals=incidentSignalCodes({
  schedulerLastSeenAt:latest?.occurredAt??null,
  latestWorkerStatus:latest?.status??null,
  overdueSchedules:overdue,archiveUnknown,archiveRejected,archiveOldPending,
  calendarOldPending,
 },now);
 return {healthy:signals.length===0,signals,observedAt:now.toISOString()};
}
