"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";

type Service="MORTGAGE"|"INSURANCE"|"REAL_ESTATE"|"INVESTMENTS";
type Affiliation={id:string;clerkUserId:string;service:string;status:string;
 jurisdiction:string;firmRegistryId:string;checkedAt:string|null;expiresAt:string|null};
const options:Service[]=["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"];
export default function AffiliationClient({businessId,affiliations}:{
 businessId:string;affiliations:Affiliation[];
}){
 const router=useRouter();
 const [service,setService]=useState<Service>("MORTGAGE");
 const [staff,setStaff]=useState("");
 const [practitioner,setPractitioner]=useState("");
 const [firm,setFirm]=useState("");
 const [jurisdiction,setJurisdiction]=useState("CA");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function send(method:"POST"|"PATCH",body:unknown){
  const response=await fetch("/api/chess/regulated-affiliations",{
   method,credentials:"same-origin",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(body),
  });
  if(!response.ok)throw new Error(response.status===403?
   "Only an authorized administrator with verified staff assignments may do this.":
   "Official registry verification is unavailable or its evidence was rejected.");
  router.refresh();
 }
 async function register(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   await send("POST",{businessId,clerkUserId:staff,service,
    jurisdiction,practitionerRegistryId:practitioner,firmRegistryId:firm});
   setMessage("Affiliation recorded as UNVERIFIED. Registration does not grant authority.");
  }catch(e){setError(e instanceof Error?e.message:"Registration failed.");}
  finally{setBusy(false);}
 }
 async function verify(affiliationId:string){
  setBusy(true);setError("");setMessage("");
  try{
   await send("PATCH",{businessId,affiliationId});
   setMessage("Registry response recorded. Only matching official active evidence can verify the affiliation.");
  }catch(e){setError(e instanceof Error?e.message:"Verification failed.");}
  finally{setBusy(false);}
 }
 return <section className="space-y-4">
  <h2 className="text-xl font-semibold">Firm and practitioner affiliations</h2>
  <p className="text-sm text-slate-600">
   A verified individual license is not enough on its own. The permitted
   employing firm and professional relationship must also be confirmed
   using an approved official registry before any partner coordination.
  </p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
  <form onSubmit={register} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
   <label className="text-sm">Service
    <select value={service} onChange={e=>setService(e.target.value as Service)}
     className="mt-1 block w-full rounded-lg border border-slate-300 p-2">
     {options.map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
    </select>
   </label>
   <label className="text-sm">Licensed staff account ID
    <input required value={staff} onChange={e=>setStaff(e.target.value)}
     className="mt-1 block w-full rounded-lg border border-slate-300 p-2"/>
   </label>
   <label className="text-sm">Official practitioner registry ID
    <input required value={practitioner} onChange={e=>setPractitioner(e.target.value)}
     className="mt-1 block w-full rounded-lg border border-slate-300 p-2"/>
   </label>
   <label className="text-sm">Official employing broker or firm registry ID
    <input required value={firm} onChange={e=>setFirm(e.target.value)}
     className="mt-1 block w-full rounded-lg border border-slate-300 p-2"/>
   </label>
   <label className="text-sm">Jurisdiction
    <input required value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)}
     className="mt-1 block w-full rounded-lg border border-slate-300 p-2"/>
   </label>
   <div className="flex items-end">
    <button type="submit" disabled={busy}
     className="rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
     Register unverified association
    </button>
   </div>
  </form>
  {affiliations.length>0&&<ul className="space-y-2">
   {affiliations.map(x=><li key={x.id}
    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
    <div>
     <strong className="text-sm">{x.service.replaceAll("_"," ")} · {x.status}</strong>
     <p className="text-xs text-slate-600">Staff {x.clerkUserId} · Firm {x.firmRegistryId}</p>
     <p className="text-xs text-slate-600">
      Checked: {x.checkedAt?new Date(x.checkedAt).toLocaleString():"Never"}
     </p>
    </div>
    <button type="button" disabled={busy} onClick={()=>verify(x.id)}
     className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
     Verify with official source
    </button>
   </li>)}</ul>}
 </section>;
}
