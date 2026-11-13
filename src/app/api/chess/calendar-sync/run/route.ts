import {NextResponse} from "next/server";
import {assertAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
import {isAuthorizedRecurrenceWorker} from "@/lib/chess/recurring-work";
import {syncChessPendingCalendarEvents} from "@/lib/chess/calendar-sync";
import {syncChessAppointmentCalendars} from "@/lib/chess/appointment-calendar-sync";
import {recordChessWorkerRun} from "@/lib/chess/worker-health";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Machine-only calendar bridge; tenant is resolved by the validated `t`
 * query parameter and never by an untrusted x-tenant header. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token))
  return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  assertAuthorizedWorkflowTenant(true);
  const result=await syncChessPendingCalendarEvents();
  const appointments=await syncChessAppointmentCalendars();
  if(result.disabled||appointments.disabled)throw new Error("Calendar gateway disabled");
  await recordChessWorkerRun("CALENDAR_SYNC",{
   examined:result.examined+appointments.examined,
   processed:result.synced+result.cancelled+appointments.synced+appointments.cancelled,
   blocked:result.rejected+result.unknown+result.cancelUnknown+
    result.reconciliationUnresolved+appointments.rejected+appointments.unknown+appointments.unresolved,
  });
  return NextResponse.json({...result,appointments},{headers:{"Cache-Control":"no-store"}});
 }catch{
  try{await recordChessWorkerRun("CALENDAR_SYNC",{
   examined:0,processed:0,blocked:0,failed:true,
  });}catch{/* A database outage may prevent heartbeat persistence. */}
  return NextResponse.json({error:"Calendar synchronization unavailable"},{status:503});
 }
}
