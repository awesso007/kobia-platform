"use client";
import {useState} from "react";
type Staff={clerkUserId:string;displayName:string;role:string};
type QueueItem={id:string;title:string;status:string;assignedClerkUserId:string|null;
 dueAt:string|null;updatedAt:string;};
type Queue={blocked:QueueItem[];unassigned:QueueItem[];overdue:QueueItem[]};
export default function ManagerQueueClient({businessId,initialQueue,staff}:{
 businessId:string;initialQueue:Queue;staff:Staff[];
}){
 const [queue,setQueue]=useState(initialQueue);
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 async function refresh(){
  const response=await fetch(`/api/chess/manager-queue?businessId=${encodeURIComponent(businessId)}`,{
   cache:"no-store",credentials:"same-origin",
  });
  if(!response.ok)throw new Error("Unable to refresh manager queue.");
  const data=await response.json() as Queue;
  setQueue(data);
 }
 async function assign(item:QueueItem){
  const clerkUserId=selected[item.id]??staff[0]?.clerkUserId;
  if(!clerkUserId)return;
  setBusy(item.id);setError("");
  try{
   const response=await fetch("/api/chess/manager-queue",{
    method:"PATCH",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,workItemId:item.id,clerkUserId,
     expectedUpdatedAt:item.updatedAt}),
   });
   if(!response.ok)throw new Error(response.status===409?
    "Task changed. Refresh and try again.":"Could not assign the employee.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Assignment failed.");}
  finally{setBusy(null);}
 }
 return <div className="space-y-4">
  <p className="text-sm text-slate-600">
   Blocked: {queue.blocked.length} · Unassigned: {queue.unassigned.length} · Overdue: {queue.overdue.length}
  </p>
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-800">{error}</p>}
  <h3 className="text-base font-semibold">Assign unassigned work</h3>
  {staff.length===0?<p role="status" className="rounded-lg border border-amber-200 p-3 text-sm text-amber-900">
   No eligible active employees are available in this business. Ask a tenant administrator
   to assign staff before attempting to delegate these work items.
  </p>:null}
  {queue.unassigned.length===0?<p className="text-sm text-slate-600">No unassigned work items.</p>:
   <ul className="space-y-2">{queue.unassigned.map(item=><li key={item.id}
    className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
    <span className="min-w-48 flex-1">{item.title}</span>
    <label className="sr-only" htmlFor={`assignee-${item.id}`}>Employee for {item.title}</label>
    <select id={`assignee-${item.id}`} value={selected[item.id]??staff[0]?.clerkUserId??""}
     onChange={e=>setSelected(old=>({...old,[item.id]:e.target.value}))}
     className="rounded-md border border-slate-300 px-2 py-2">
     {staff.map(person=><option key={person.clerkUserId} value={person.clerkUserId}>
      {person.displayName}
     </option>)}
    </select>
    <button type="button" disabled={busy!==null||staff.length===0} onClick={()=>assign(item)}
     className="rounded-md border border-emerald-800 px-3 py-2 font-semibold text-emerald-800 disabled:opacity-40">
     Assign
    </button>
   </li>)}</ul>}
  <h3 className="text-base font-semibold">Blocked or overdue work</h3>
  {queue.overdue.length===0&&queue.blocked.length===0?
   <p className="text-sm text-slate-600">No blocked or overdue work.</p>:
   <ul className="space-y-2">{[...new Map([...queue.blocked,...queue.overdue]
    .map(item=>[item.id,item])).values()].map(item=>
    <li key={item.id} className="rounded-md border border-amber-200 p-3 text-sm">
     <strong>{item.title}</strong> · {item.status.replaceAll("_"," ")}
     {item.dueAt?` · Due ${new Date(item.dueAt).toLocaleDateString()}`:""}
    </li>)}</ul>}
 </div>;
}
