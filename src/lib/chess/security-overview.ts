import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";
import {incidentSignalCodes} from "./incident-monitor";

/** A CRM admin is not enough: only current KOBIA tenant OWNER/ADMIN may
 * inspect tenant-wide security decision counts and worker health. */
export function mayReadChessSecurityOverview(role:string,status:string){
 return status==="ACTIVE"&&(role==="OWNER"||role==="ADMIN");
}
/** Private, tenant-local source audit. No client, bank, property, document,
 * employee payroll, provider secret or personal data is selected. */
export async function getChessSecurityOverview(now=new Date()){
 const actor=await getCurrentMembership();
 if(!actor||!mayReadChessSecurityOverview(actor.role,actor.status))
  throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return auditedChessSensitiveRead(db,{
  actorClerkUserId:actor.clerkUserId,action:"SECURITY_OPERATIONS_READ",
  resourceType:"ChessSecurityEvent",resourceId:"RECENT",
 },async tx=>{
  const current=await tx.membership.findUnique({
   where:{clerkUserId:actor.clerkUserId},select:{status:true,role:true},
  });
  if(!current||!mayReadChessSecurityOverview(current.role,current.status))return null;
  const old=new Date(now.getTime()-30*60_000);
  const [recent,decisions,archiveRows,unqueued,workers,overdueSchedules,
   archiveOldPending,calendarOldPending]=await Promise.all([
   tx.chessSecurityEvent.findMany({orderBy:{occurredAt:"desc"},take:30,
    select:{id:true,action:true,resourceType:true,decision:true,occurredAt:true}}),
   tx.chessSecurityEvent.groupBy({by:["decision"],_count:{_all:true},
    where:{occurredAt:{gte:new Date(now.getTime()-24*60*60_000)}}}),
   tx.chessAuditArchiveOutbox.groupBy({by:["status"],_count:{_all:true}}),
   tx.chessSecurityEvent.count({where:{archive:null}}),
   tx.chessWorkerRun.findMany({orderBy:{occurredAt:"desc"},take:40,
    select:{kind:true,status:true,occurredAt:true,
     examined:true,processed:true,blocked:true}}),
   tx.chessWorkRecurrence.count({where:{active:true,nextRunAt:{lt:old}}}),
   tx.chessAuditArchiveOutbox.count({where:{
    status:{in:["PENDING","SUBMITTING"]},createdAt:{lt:old}}}),
   tx.chessAppointmentCalendarOutbox.count({where:{
    status:{in:["UNKNOWN","CANCEL_UNKNOWN","CANCEL_PENDING"]},
    createdAt:{lt:old},
   }}),
  ]);
  const count=(status:string)=>archiveRows.find(row=>row.status===status)?._count._all??0;
  const latestRecurring=workers.find(x=>x.kind==="RECURRING_WORK");
  const signals=incidentSignalCodes({
   schedulerLastSeenAt:latestRecurring?.occurredAt??null,
   latestWorkerStatus:workers[0]?.status??null,
   overdueSchedules,archiveUnknown:count("UNKNOWN"),archiveRejected:count("REJECTED"),
   archiveOldPending,calendarOldPending,
  },now);
  return {
   observedAt:now.toISOString(),
   recent,workers,signals,
   auditDecisions:decisions.map(x=>({decision:x.decision,count:x._count._all})),
   archive:{
    unqueued,pending:count("PENDING")+count("SUBMITTING"),
    unknown:count("UNKNOWN"),rejected:count("REJECTED"),
    archived:count("ARCHIVED"),
   },
   overdueSchedules,calendarOldPending,
   externalMonitorActivated:process.env.CHESS_INCIDENT_MONITOR_ENABLED==="true"&&
    process.env.CHESS_INCIDENT_MONITOR_OPS_APPROVED==="true",
  };
 });
}
