"use client";
import {useEffect,useState} from "react";
type Connection={available:boolean;state:string;scopes:string[]};
export default function DelegatedCalendarConnection(){
 const [connection,setConnection]=useState<Connection|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function refresh(){
  setError("");
  try{
   const response=await fetch("/api/chess/calendar-oauth",{
    credentials:"same-origin",cache:"no-store",
   });
   if(!response.ok)throw new Error("The calendar connection cannot be checked.");
   setConnection(await response.json() as Connection);
  }catch(e){setError(e instanceof Error?e.message:"Calendar status unavailable.");}
 }
 useEffect(()=>{void refresh();},[]);
 async function action(method:"POST"|"DELETE"){
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/chess/calendar-oauth",{
    method,credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:"{}",
   });
   if(!response.ok)throw new Error(response.status===403?
    "Enable your calendar preference first. Disconnect also requires all existing remote events to be confirmed cancelled.":
    "The approved calendar connection gateway is not available.");
   const result=await response.json();
   if(method==="POST"){
    if(typeof result.connectUrl!=="string")
     throw new Error("Calendar provider did not return a valid connection destination.");
    // Backend pins this to the approved HTTPS OAuth gateway and
    // verifies nonce, tenant, signed-in user, and five-minute expiry.
    window.location.assign(result.connectUrl);
   }else{
    setNotice("Delegated calendar connection revoked by the approved gateway.");
    await refresh();
   }
  }catch(e){setError(e instanceof Error?e.message:"Unable to change calendar connection.");}
  finally{setBusy(false);}
 }
 const state=connection?.state??"CHECKING";
 return <section className="space-y-3 rounded-lg border border-slate-200 p-4">
  <h3 className="font-semibold">Delegated Google/Microsoft calendar connection</h3>
  <p className="text-sm text-slate-700">
   Your CHESS calendar sharing choices are separate from OAuth authorization.
   The approved gateway manages provider login, PKCE, token storage and renewal;
   CHESS never receives provider passwords or browser tokens.
  </p>
  <p className="text-sm font-semibold">Connection: {state.replaceAll("_"," ")}</p>
  {connection?.available===false?<p className="text-sm text-amber-900">
   Provider OAuth is disabled until the calendar gateway and its
   legal/privacy contract are independently approved.</p>:
  <div className="flex flex-wrap gap-3">
   <button type="button" disabled={busy||connection?.available!==true}
    onClick={()=>void action("POST")}
    className="rounded-md border border-emerald-800 px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-40">
    Connect or renew my calendar
   </button>
   {connection?.state==="CONNECTED"&&<button type="button" disabled={busy}
    onClick={()=>void action("DELETE")}
    className="rounded-md border border-red-400 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-40">
    Revoke delegated calendar access
   </button>}
   <button type="button" disabled={busy} onClick={()=>void refresh()}
    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40">
    Refresh connection status
   </button>
  </div>}
  {connection?.scopes.length? <p className="text-xs text-slate-600">
   Approved scopes: {connection.scopes.join(", ")}
  </p>:null}
  <p className="text-xs text-slate-600">
   Disable sharing and allow remote event cancellations to reconcile
   before revoking the provider token. An unconfirmed cancellation blocks
   disconnection rather than silently leaving a remote event behind.
  </p>
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </section>;
}
