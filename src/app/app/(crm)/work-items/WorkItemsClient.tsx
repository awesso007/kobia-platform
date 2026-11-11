"use client";
import {useState} from "react";
import {isAllowedWorkTransition,type WorkStatus} from "@/lib/chess/work-item-transitions";
type Task={id:string;title:string;status:WorkStatus;dueAt:string|null;
 assignedClerkUserId:string|null;updatedAt:string};
export default function WorkItemsClient({businessId,initialTasks}:{businessId:string;initialTasks:Task[]}){
 const [tasks,setTasks]=useState(initialTasks);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 async function update(task:Task,status:WorkStatus){
  setBusy(task.id);setError("");
  try{
   const response=await fetch("/api/chess/work-items",{
    method:"PATCH",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,id:task.id,status,expectedUpdatedAt:task.updatedAt}),
   });
   if(!response.ok)throw new Error(response.status===409?
    "This item changed. Refresh before updating it.":"Unable to update this item.");
   const result=await response.json() as {workItem:{status:WorkStatus;updatedAt:string}};
   setTasks(current=>current.map(item=>item.id===task.id?
    {...item,status:result.workItem.status,updatedAt:result.workItem.updatedAt}:item));
  }catch(e){setError(e instanceof Error?e.message:"Unable to update item.");}
  finally{setBusy(null);}
 }
 return <div className="space-y-4">
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-800">{error}</p>}
  {tasks.length===0?<p className="rounded-lg border border-slate-200 p-6 text-slate-600">
   No work items are assigned to you in this workspace.
  </p>:<ul className="space-y-3">{tasks.map(task=><li key={task.id}
   className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
   <div>
    <p className="font-semibold text-slate-900">{task.title}</p>
    <p className="text-sm text-slate-600">
     {task.status.replaceAll("_"," ")}
     {task.dueAt?` · Due ${new Date(task.dueAt).toLocaleDateString()}`:""}
    </p>
   </div>
   <div className="flex flex-wrap gap-2">
    {(["IN_PROGRESS","BLOCKED","COMPLETED","CANCELLED"] as WorkStatus[])
     .filter(next=>isAllowedWorkTransition(task.status,next))
     .map(next=><button key={next} type="button" disabled={busy!==null}
      onClick={()=>update(task,next)}
      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
      {next.replaceAll("_"," ")}
     </button>)}
   </div>
  </li>)}</ul>}
 </div>;
}
