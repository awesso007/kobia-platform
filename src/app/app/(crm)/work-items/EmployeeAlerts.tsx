"use client";
import {useState} from "react";
type Alert={id:string;message:string;readAt:string|null;createdAt:string};
export default function EmployeeAlerts({
 businessId,initialAlerts,
}:{businessId:string;initialAlerts:Alert[]}){
 const [alerts,setAlerts]=useState(initialAlerts);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 async function markRead(alertId:string){
  setBusy(alertId);setError("");
  try{
   const response=await fetch("/api/chess/alerts",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    credentials:"same-origin",body:JSON.stringify({businessId,alertId}),
   });
   if(!response.ok)throw new Error("Unable to mark notification as read.");
   setAlerts(old=>old.map(a=>a.id===alertId?{...a,readAt:new Date().toISOString()}:a));
  }catch(e){setError(e instanceof Error?e.message:"Notification update failed.");}
  finally{setBusy(null);}
 }
 const unread=alerts.filter(a=>!a.readAt);
 return <div className="space-y-2">
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {unread.length===0?<p className="text-sm text-slate-600">No unread notifications.</p>:
   <ul className="space-y-2">{unread.map(a=><li key={a.id}
    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
    <span>{a.message} · {new Date(a.createdAt).toLocaleDateString()}</span>
    <button type="button" disabled={busy!==null} onClick={()=>markRead(a.id)}
     className="rounded-md border border-slate-300 px-3 py-2 font-medium disabled:opacity-40">
     Mark read
    </button>
   </li>)}</ul>}
 </div>;
}
