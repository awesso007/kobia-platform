import Link from "next/link";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {listChessWorkItems} from "@/lib/chess/workflow";
import {getChessManagerQueue,listChessEmployeeAlerts} from "@/lib/chess/employee-operations";
import WorkItemsClient from "./WorkItemsClient";
import RecurrencesClient from "./RecurrencesClient";
import EmployeeAlerts from "./EmployeeAlerts";
import CalendarConsent from "./CalendarConsent";
import AppointmentsClient from "./AppointmentsClient";
import {listChessAppointments,listChessAssignableStaff} from "@/lib/chess/appointments";
import {getMyCalendarPreference} from "@/lib/chess/calendar-preferences";
import {listChessRecurrences} from "@/lib/chess/recurring-work";
export const dynamic="force-dynamic";
export default async function ChessWorkItemsPage({searchParams}:{searchParams:{businessId?:string}}){
 let businesses:Awaited<ReturnType<typeof listBusinessUnits>>=[];
 try{businesses=await listBusinessUnits();}catch{
  return <main className="mx-auto max-w-4xl p-8" role="alert">This workspace is unavailable or access was denied.</main>;
 }
 const requested=searchParams.businessId;
 const selected=businesses.find(b=>b.id===requested)??businesses[0];
 if(!selected)return <main className="mx-auto max-w-4xl p-8">No active business assignment is available.</main>;
 const [tasks,alerts,manager,recurrences,calendarPreference,appointments,staff]=await Promise.all([
  listChessWorkItems(selected.id).catch(()=>[]),
  listChessEmployeeAlerts(selected.id).catch(()=>[]),
  getChessManagerQueue(selected.id).catch(()=>null),
  listChessRecurrences(selected.id).catch(()=>null),
  getMyCalendarPreference().catch(()=>({enabled:false,acknowledgedAt:null})),
  listChessAppointments(selected.id).catch(()=>null),
  listChessAssignableStaff(selected.id).catch(()=>null),
 ]);
 const serialize=tasks.map(t=>({...t,
  dueAt:t.dueAt?.toISOString()??null,updatedAt:t.updatedAt.toISOString(),
 }));
 return <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
  <header>
   <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">CHESS CORP 2 · Operations</p>
   <h1 className="mt-1 text-3xl font-semibold">Employee work items</h1>
   <p className="mt-2 text-sm text-slate-600">Tasks, recurring schedules and in-app notifications.</p>
  </header>
  <nav aria-label="Business workspaces" className="flex flex-wrap gap-2">
   {businesses.map(b=><Link key={b.id} href={`/app/work-items?businessId=${encodeURIComponent(b.id)}`}
    className={`rounded-lg px-3 py-2 text-sm ${selected.id===b.id?"bg-emerald-800 text-white":"border border-slate-200"}`}>
    {b.name}
   </Link>)}
  </nav>
  <section className="space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <h2 className="text-xl font-semibold">{selected.name} · Work items</h2>
    <a href={`/api/chess/calendar.ics?businessId=${encodeURIComponent(selected.id)}`}
     className="text-sm font-semibold text-emerald-700 hover:underline">Export my calendar (.ics)</a>
   </div>
   <WorkItemsClient businessId={selected.id} initialTasks={serialize}/>
  </section>
  <section className="space-y-3">
   <h2 className="text-xl font-semibold">Calendar sharing</h2>
   <CalendarConsent initialEnabled={calendarPreference.enabled}/>
  </section>
  <section className="space-y-3">
   <h2 className="text-xl font-semibold">My notifications</h2>
   <EmployeeAlerts businessId={selected.id} initialAlerts={alerts.map(a=>({
    id:a.id,message:a.message,
    readAt:a.readAt?.toISOString()??null,
    createdAt:a.createdAt.toISOString(),
   }))}/>
  </section>
  {manager&&<section className="space-y-3">
   <h2 className="text-xl font-semibold">Manager oversight</h2>
   <p className="text-sm text-slate-600">Blocked: {manager.blocked.length} ·
    Unassigned: {manager.unassigned.length} · Overdue: {manager.overdue.length}</p>
   <ul className="space-y-2">{manager.overdue.slice(0,20).map(item=>
    <li key={item.id} className="rounded-lg border border-orange-200 bg-white p-3 text-sm">
     <strong>{item.title}</strong> · {item.status.replaceAll("_"," ")}
    </li>)}</ul>
  </section>}
  {appointments&&staff&&<section className="space-y-3">
   <h2 className="text-xl font-semibold">Appointments</h2>
   <p className="text-sm text-slate-600">Time slots are protected against overlapping staff bookings.</p>
   <AppointmentsClient businessId={selected.id} staff={staff}
    initialAppointments={appointments.map(item=>({
     ...item,startAt:item.startAt.toISOString(),endAt:item.endAt.toISOString(),
     updatedAt:item.updatedAt.toISOString(),
    }))}/>
  </section>}
  {recurrences&&<section className="space-y-3">
   <h2 className="text-xl font-semibold">Recurring schedules</h2>
   <p className="text-sm text-slate-600">Scheduled times are stored in UTC. New tasks are created by the configured operations worker.</p>
   <RecurrencesClient businessId={selected.id} initialRecurrences={recurrences.map(item=>({
    ...item,nextRunAt:item.nextRunAt.toISOString(),
    lastRunAt:item.lastRunAt?.toISOString()??null,
    updatedAt:item.updatedAt.toISOString(),
   }))}/>
  </section>}
  <Link href="/app/overview" className="text-sm font-medium text-emerald-700 hover:underline">
   Back to operations overview
  </Link>
 </main>;
}
