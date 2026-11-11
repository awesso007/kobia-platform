"use client";
import {useState} from "react";

export default function CalendarConsent({initialEnabled}:{initialEnabled:boolean}){
 const [enabled,setEnabled]=useState(initialEnabled);
 const [ack,setAck]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function update(next:boolean){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/chess/calendar-preferences",{
    method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(next?{enabled:true,acknowledge:true}:{enabled:false}),
   });
   if(!response.ok)throw new Error("Could not update calendar sharing preference.");
   const result=await response.json() as {enabled:boolean};
   setEnabled(result.enabled);setAck(false);
   setNotice(result.enabled?
    "Your preference is saved. No events will be shared until the calendar gateway and delegated provider access are configured.":
    "Calendar sharing is disabled. Remote cancellations are queued for previously synchronized events.");
  }catch(e){setError(e instanceof Error?e.message:"Calendar preference could not be saved.");}
  finally{setBusy(false);}
 }
 return <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
  <p className="text-sm text-slate-700">Calendar event sharing is optional. If enabled and the integration is activated,
   CHESS may send a generic work-item event with its due time to an approved calendar provider.
   Client names, task descriptions and financial details are not sent.</p>
  <p className="text-sm font-semibold">Calendar sharing: {enabled?"Opted in":"Off"}</p>
  {!enabled&&<label className="flex items-start gap-2 text-sm">
   <input className="mt-1" type="checkbox" checked={ack}
    onChange={event=>setAck(event.target.checked)}/>
   I authorize CHESS to share generic work event timing with my connected calendar provider.
  </label>}
  <button type="button" disabled={busy||(!enabled&&!ack)}
   onClick={()=>update(!enabled)}
   className="rounded-lg border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
   {enabled?"Turn calendar sharing off":"Opt in to calendar sharing"}
  </button>
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
