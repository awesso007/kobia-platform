"use client";
import {useState} from "react";

export default function CalendarConsent({
 initialEnabled,initialAppointmentsEnabled,
}:{initialEnabled:boolean;initialAppointmentsEnabled:boolean}){
 const [enabled,setEnabled]=useState(initialEnabled);
 const [appointmentsEnabled,setAppointmentsEnabled]=useState(initialAppointmentsEnabled);
 const [tasksAcknowledged,setTasksAcknowledged]=useState(false);
 const [appointmentsAcknowledged,setAppointmentsAcknowledged]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function save(preference:Record<string,unknown>):Promise<{
  enabled:boolean;appointmentsEnabled?:boolean;
 }>{
  const response=await fetch("/api/chess/calendar-preferences",{
   method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(preference),
  });
  if(!response.ok)throw new Error("Calendar consent could not be saved.");
  return response.json() as Promise<{enabled:boolean;appointmentsEnabled?:boolean}>;
 }
 async function changeTasks(next:boolean){
  setBusy(true);setError("");setNotice("");
  try{
   const result=await save(next?{enabled:true,acknowledge:true}:{enabled:false});
   setEnabled(result.enabled);
   if(!result.enabled)setAppointmentsEnabled(false);
   setTasksAcknowledged(false);
   setNotice(next?"Task calendar preference recorded. External sharing requires a connected calendar.":
    "All calendar sharing disabled; synchronized events are queued for cancellation.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to update consent.");}
  finally{setBusy(false);}
 }
 async function changeAppointments(next:boolean){
  setBusy(true);setError("");setNotice("");
  try{
   const result=await save(next?{
    scope:"APPOINTMENTS",enabled:true,acknowledge:true,
   }:{scope:"APPOINTMENTS",enabled:false});
   setAppointmentsEnabled(result.appointmentsEnabled??false);
   setAppointmentsAcknowledged(false);
   setNotice(next?"Appointment timing sharing permission recorded. The external calendar must be separately connected.":
    "Appointment timing sharing disabled; remote cancellations are queued if needed.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to update appointment consent.");}
  finally{setBusy(false);}
 }
 return <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4">
  <section className="space-y-3">
   <h3 className="font-semibold">Work-item calendar events</h3>
   <p className="text-sm text-slate-700">If enabled, CHESS may share a generic work-item title
    and due time with your separately connected calendar. No client names,
    descriptions or financial details are transmitted.</p>
   <p className="text-sm font-semibold">Work-item sharing: {enabled?"Consented":"Off"}</p>
   {!enabled&&<label className="flex items-start gap-2 text-sm">
    <input className="mt-1" type="checkbox" checked={tasksAcknowledged}
     onChange={e=>setTasksAcknowledged(e.target.checked)}/>
    I explicitly authorize sharing generic work-item timing with my connected calendar.
   </label>}
   <button type="button" disabled={busy||(!enabled&&!tasksAcknowledged)}
    onClick={()=>changeTasks(!enabled)}
    className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
    {enabled?"Disable all calendar sharing":"Enable work-item calendar sharing"}
   </button>
  </section>
  <section className="space-y-3 border-t border-slate-200 pt-4">
   <h3 className="font-semibold">Appointment calendar events</h3>
   <p className="text-sm text-slate-700">This is separate from work-item consent.
    With your permission, CHESS may share appointment start and end times and
    the generic title CHESS appointment. The appointment subject and client
    information remain inside the authorized CHESS workspace.</p>
   <p className="text-sm font-semibold">Appointment sharing: {appointmentsEnabled?"Consented":"Off"}</p>
   {!appointmentsEnabled&&enabled&&<label className="flex items-start gap-2 text-sm">
    <input className="mt-1" type="checkbox" checked={appointmentsAcknowledged}
     onChange={e=>setAppointmentsAcknowledged(e.target.checked)}/>
    I separately authorize sharing generic appointment timing with my connected calendar.
   </label>}
   <button type="button" disabled={busy||(!appointmentsEnabled&&(!enabled||!appointmentsAcknowledged))}
    onClick={()=>changeAppointments(!appointmentsEnabled)}
    className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
    {appointmentsEnabled?"Disable appointment sharing":"Enable appointment sharing"}
   </button>
   {!enabled&&<p className="text-xs text-slate-600">Enable work-item calendar sharing
    first to activate the separate appointment preference.</p>}
  </section>
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
