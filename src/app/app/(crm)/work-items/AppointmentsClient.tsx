"use client";
import {useState,type FormEvent} from "react";

type Staff={clerkUserId:string;displayName:string;role:string};
type Appointment={
 id:string;subject:string;status:"SCHEDULED"|"COMPLETED"|"CANCELLED";
 assignedClerkUserId:string;startAt:string;endAt:string;updatedAt:string;
};

export default function AppointmentsClient({businessId,initialAppointments,staff}:{
 businessId:string;initialAppointments:Appointment[];staff:Staff[];
}){
 const [appointments,setAppointments]=useState(initialAppointments);
 const [assignee,setAssignee]=useState(staff[0]?.clerkUserId??"");
 const [subject,setSubject]=useState("");
 const [start,setStart]=useState("");
 const [duration,setDuration]=useState(30);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function refresh(){
  const response=await fetch(`/api/chess/appointments?businessId=${encodeURIComponent(businessId)}`,{
   credentials:"same-origin",cache:"no-store",
  });
  if(!response.ok)throw new Error("Unable to refresh appointments.");
  const body=await response.json() as {appointments:Appointment[]};
  setAppointments(body.appointments);
 }
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");
  try{
   const startAt=new Date(start);
   if(!Number.isFinite(startAt.getTime()))throw new Error("Choose a valid meeting time.");
   const endAt=new Date(startAt.getTime()+duration*60_000);
   const response=await fetch("/api/chess/appointments",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,assignedClerkUserId:assignee,subject,
     startAt:startAt.toISOString(),endAt:endAt.toISOString()}),
   });
   if(!response.ok)throw new Error(response.status===409?
    "This employee is already booked during that period.":
    "Unable to schedule this appointment.");
   await refresh();setSubject("");setStart("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to book appointment.");}
  finally{setBusy(false);}
 }
 async function cancel(item:Appointment){
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/chess/appointments",{
    method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,appointmentId:item.id,expectedUpdatedAt:item.updatedAt}),
   });
   if(!response.ok)throw new Error(response.status===409?
    "Appointment changed. Refresh before canceling.":"Unable to cancel appointment.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to cancel appointment.");}
  finally{setBusy(false);}
 }
 return <div className="space-y-4">
  {error&&<p role="alert" className="rounded-md border border-red-200 p-3 text-sm text-red-700">{error}</p>}
  <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
   <label className="text-sm">Meeting subject
    <input required minLength={2} maxLength={180} value={subject}
     onChange={e=>setSubject(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/>
   </label>
   <label className="text-sm">Assigned employee
    <select required value={assignee} onChange={e=>setAssignee(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2">
     {staff.map(p=><option key={p.clerkUserId} value={p.clerkUserId}>{p.displayName}</option>)}
    </select>
   </label>
   <label className="text-sm">Start time (local)
    <input required type="datetime-local" value={start}
     onChange={e=>setStart(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/>
   </label>
   <label className="text-sm">Duration
    <select value={duration} onChange={e=>setDuration(Number(e.target.value))}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2">
     <option value={15}>15 minutes</option>
     <option value={30}>30 minutes</option>
     <option value={60}>1 hour</option>
     <option value={120}>2 hours</option>
    </select>
   </label>
   <button type="submit" disabled={!staff.length||busy}
    className="rounded-md bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
    Schedule appointment
   </button>
  </form>
  <ul className="space-y-2">{appointments.map(item=><li key={item.id}
   className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
   <div><strong>{item.subject}</strong>
    <p className="text-slate-600">{new Date(item.startAt).toLocaleString()} ·
     {staff.find(p=>p.clerkUserId===item.assignedClerkUserId)?.displayName??"Assigned employee"} ·
     {item.status}</p>
   </div>
   {item.status==="SCHEDULED"&&<button type="button" disabled={busy}
    onClick={()=>cancel(item)}
    className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-40">
    Cancel
   </button>}
  </li>)}</ul>
 </div>;
}
