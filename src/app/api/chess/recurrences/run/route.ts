import {NextResponse} from "next/server";
import {assertAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
import {isAuthorizedRecurrenceWorker,runDueChessRecurrences} from "@/lib/chess/recurring-work";
import {runChessOverdueAlerts} from "@/lib/chess/overdue-alerts";
import {runChessAppointmentReminders} from "@/lib/chess/appointment-reminders";
import {recordChessWorkerRun} from "@/lib/chess/worker-health";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Machine-only scheduler. The `t` tenant is validated and injected by middleware.
 * The bearer token is not a query parameter and must stay in the secret store. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token)){
  return NextResponse.json({error:"Forbidden"},{status:403});
 }
 try{
  assertAuthorizedWorkflowTenant(false);
  const result=await runDueChessRecurrences();
  const overdue=await runChessOverdueAlerts();
  const appointments=await runChessAppointmentReminders();
  await recordChessWorkerRun("RECURRING_WORK",{
   examined:result.examined+overdue.examined+appointments.examined,
   processed:result.generated+overdue.inserted+appointments.inserted,
   blocked:result.blocked,
  });
  return NextResponse.json({...result,overdue,appointments},{headers:{"Cache-Control":"no-store"}});
 }catch{
  try{await recordChessWorkerRun("RECURRING_WORK",{
   examined:0,processed:0,blocked:0,failed:true,
  });}catch{/* A database outage may prevent heartbeat persistence. */}
  return NextResponse.json({error:"Scheduling unavailable"},{status:503});
 }
}
