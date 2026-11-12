"use client";
import React,{useState} from "react";
type Recurrence={
 id:string;title:string;frequency:"DAILY"|"WEEKLY"|"MONTHLY";interval:number;
 active:boolean;nextRunAt:string;lastRunAt:string|null;lastInspectedAt:string|null;
 assignedClerkUserId:string|null;updatedAt:string;
};
type StaffChoice={clerkUserId:string;displayName:string;role:string};
export default function RecurrencesClient({
 businessId,initialRecurrences,staff=[],
}:{businessId:string;initialRecurrences:Recurrence[];staff?:StaffChoice[]}){
 const [items,setItems]=useState(initialRecurrences);
 const [title,setTitle]=useState("");
 const [frequency,setFrequency]=useState<Recurrence["frequency"]>("MONTHLY");
 const [interval,setInterval]=useState(1);
 const [when,setWhen]=useState("");
 const [assignee,setAssignee]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function refresh(){
  const response=await fetch(`/api/chess/recurrences?businessId=${encodeURIComponent(businessId)}`,{cache:"no-store"});
  if(!response.ok)throw new Error("Unable to refresh schedules.");
  const data=await response.json() as {recurrences:Recurrence[]};
  setItems(data.recurrences);
 }
 async function create(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError("");
  try{
   const date=new Date(when);
   if(!Number.isFinite(date.getTime()))throw new Error("Choose a valid start time.");
   const response=await fetch("/api/chess/recurrences",{
    method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({businessId,title,frequency,interval,firstRunAt:date.toISOString(),
     ...(assignee.trim()?{assignedClerkUserId:assignee.trim()}:{})}),
   });
   if(!response.ok)throw new Error("Schedule was rejected. Check the business assignment and start time.");
   await refresh();setTitle("");setWhen("");setAssignee("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to create schedule.");}
  finally{setBusy(false);}
 }
 async function toggle(item:Recurrence){
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/chess/recurrences",{
    method:"PATCH",headers:{"Content-Type":"application/json"},credentials:"same-origin",
    body:JSON.stringify({businessId,id:item.id,active:!item.active,
     expectedUpdatedAt:item.updatedAt}),
   });
   const data=await response.json() as {updated?:boolean};
   if(!response.ok||!data.updated)throw new Error("Schedule changed. Refresh before editing.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to change schedule.");}
  finally{setBusy(false);}
 }
 return <div className="space-y-4">
  <p className="text-xs leading-5 text-slate-600">
   The worker inspection time means a due template was examined,
   not that a task was created or an external calendar updated.
   Blocked schedules may remain due until staff access is corrected.
   This screen cannot run the scheduler.
  </p>
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{error}</p>}
  <form onSubmit={create} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
   <label className="text-sm">Task title
    <input required minLength={2} maxLength={250} value={title} onChange={e=>setTitle(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/>
   </label>
   <label className="text-sm">First due date and time (local)
    <input required type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/>
   </label>
   <label className="text-sm">Repeat
    <select value={frequency} onChange={e=>setFrequency(e.target.value as Recurrence["frequency"])}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2">
     <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
    </select>
   </label>
   <label className="text-sm">Every N periods
    <input type="number" min={1} max={12} required value={interval}
     onChange={e=>setInterval(Number(e.target.value))}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/>
   </label>
   <label className="text-sm sm:col-span-2">Assign to employee
    <select value={assignee} onChange={e=>setAssignee(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2">
     <option value="">Leave unassigned for manager review</option>
     {staff.map(person=><option key={person.clerkUserId} value={person.clerkUserId}>
      {person.displayName}
     </option>)}
    </select>
   </label>
   <button disabled={busy} type="submit"
    className="rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white disabled:opacity-40">
    Create recurring schedule
   </button>
  </form>
  {items.length===0?<p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
   No recurring schedules exist for this business. Create a schedule above;
   an approved worker must be running before due work items can be generated.
  </p>:null}
  <ul className="space-y-2">{items.map(item=><li key={item.id}
   className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 text-sm">
   <div><strong className="block">{item.title}</strong>
    {item.frequency.toLowerCase()} · Every {item.interval} ·
    Next {new Date(item.nextRunAt).toLocaleString()} ·
    {item.active?" Active":" Paused"}
    <span className="block text-xs text-slate-600">
     {item.lastInspectedAt?
      `Worker last inspected ${item.lastInspectedAt.slice(0,16).replace("T"," ")} UTC`:
      "Never inspected by scheduled worker"}
    </span>
   </div>
   <button type="button" disabled={busy} onClick={()=>toggle(item)}
    className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:opacity-40">
    {item.active?"Pause":"Resume"}
   </button>
  </li>)}</ul>
 </div>;
}
