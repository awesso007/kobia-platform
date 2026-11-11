"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
type Workpaper={id:string;taxYear:number;startAt:string;endAt:string;
 sourceEntryCount:number;status:string;updatedAt:string;};
export default function TaxWorkpaperClient({
 businessId,clientProfileId,serviceCaseId,workpapers,
}:{businessId:string;clientProfileId:string;serviceCaseId:string;workpapers:Workpaper[]}){
 const router=useRouter();
 const [year,setYear]=useState(new Date().getUTCFullYear());
 const [start,setStart]=useState(`${new Date().getUTCFullYear()}-01-01`);
 const [end,setEnd]=useState(`${new Date().getUTCFullYear()+1}-01-01`);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function request(method:"POST"|"PATCH",body:unknown){
  const response=await fetch("/api/chess/tax-workpapers",{
   method,credentials:"same-origin",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(body),
  });
  if(!response.ok)throw new Error(response.status===403?
   "A separate authorized reviewer, valid consent and an active tax case are required.":
   "Tax workpaper request failed. Verify ledger balance and evidence freshness.");
  router.refresh();
 }
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   await request("POST",{
    businessId,clientProfileId,serviceCaseId,taxYear:year,
    startAt:new Date(start+"T00:00:00Z").toISOString(),
    endAt:new Date(end+"T00:00:00Z").toISOString(),
   });
   setMessage("A draft source-ledger evidence snapshot was created. This is not a tax return.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to create workpaper.");}
  finally{setBusy(false);}
 }
 async function decide(workpaper:Workpaper,decision:"REVIEWED"|"APPROVED"){
  setBusy(true);setError("");setMessage("");
  try{
   await request("PATCH",{
    businessId,workpaperId:workpaper.id,decision,
    expectedUpdatedAt:workpaper.updatedAt,
   });
   setMessage(decision==="APPROVED"?
    "Workpaper approved. No tax return has been filed.":
    "Independent review recorded; a separate authorized person must approve.");
  }catch(e){setError(e instanceof Error?e.message:"Review unavailable.");}
  finally{setBusy(false);}
 }
 return <section className="space-y-4">
  <h2 className="text-xl font-semibold">Tax workpaper evidence</h2>
  <p className="text-sm text-slate-600">This generates a checksum of posted
   journal entries, not a return or e-file submission. The preparer, reviewer,
   and final approving person must be different authorized staff members.</p>
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-800">{error}</p>}
  {message&&<p role="status" className="rounded-lg border border-emerald-200 p-3 text-sm text-emerald-800">{message}</p>}
  <form onSubmit={create} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
   <label className="text-sm">Tax year
    <input className="mt-1 block w-full rounded-md border border-slate-300 p-2"
     type="number" min={2000} max={2100} value={year} required
     onChange={e=>setYear(Number(e.target.value))}/>
   </label>
   <label className="text-sm">Period start (UTC)
    <input className="mt-1 block w-full rounded-md border border-slate-300 p-2"
     type="date" value={start} required onChange={e=>setStart(e.target.value)}/>
   </label>
   <label className="text-sm">Period end (exclusive, UTC)
    <input className="mt-1 block w-full rounded-md border border-slate-300 p-2"
     type="date" value={end} required onChange={e=>setEnd(e.target.value)}/>
   </label>
   <button disabled={busy} type="submit"
    className="rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
    Create workpaper snapshot
   </button>
  </form>
  <ul className="space-y-2">{workpapers.map(w=><li key={w.id}
   className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 text-sm">
   <div><strong>{w.taxYear} · {w.status}</strong>
    <p className="text-slate-600">{w.sourceEntryCount} posted journal entries ·
     {new Date(w.startAt).toLocaleDateString()} to {new Date(w.endAt).toLocaleDateString()}</p>
   </div>
   <div className="flex gap-2">
    {w.status==="DRAFT"&&<button type="button" disabled={busy}
     onClick={()=>decide(w,"REVIEWED")}
     className="rounded-md border border-emerald-700 px-3 py-2 font-semibold text-emerald-800 disabled:opacity-40">
     Review evidence
    </button>}
    {w.status==="REVIEWED"&&<button type="button" disabled={busy}
     onClick={()=>decide(w,"APPROVED")}
     className="rounded-md border border-emerald-700 px-3 py-2 font-semibold text-emerald-800 disabled:opacity-40">
     Approve workpaper
    </button>}
   </div>
  </li>)}</ul>
 </section>;
}
