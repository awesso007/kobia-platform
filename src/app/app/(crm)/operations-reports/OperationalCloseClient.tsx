"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

type Snapshot={id:string;businessId:string;month:string;
 sourceDigest:string;status:string;createdAt:string;
 reviewedAt:string|null;reviewedByClerkUserId:string|null;mayReview:boolean};

export default function OperationalCloseClient({businessId,month,snapshots}:{
 businessId:string;month:string;snapshots:Snapshot[];
}){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function request(method:"POST"|"PATCH",body:object,success:string){
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch("/api/chess/operational-close",{
    method,credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
   });
   if(!res.ok)throw new Error(res.status===403?
    "This period is still open, your role is not authorized, or independent review is required.":
    res.status===400?"Invalid period or snapshot.":"Snapshot operation unavailable or already exists.");
   setNotice(success);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to save snapshot.");}
  finally{setBusy(false);}
 }
 const exists=snapshots.some(s=>s.month===month);
 return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-xl font-semibold">Historical operational snapshot reviews</h2>
  <p className="text-sm text-slate-700">
   Freeze the currently visible operational workflow counts for a completed
   UTC month. An independent owner or administrator must review the
   original fixed evidence. These snapshots are not audited financial
   statements, revenue recognition, cash settlement, or consolidated accounts.
  </p>
  <button type="button" disabled={busy||exists}
   onClick={()=>void request("POST",{businessId,month},
    "Operational counts frozen. Independent administrative approval required.")}
   className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
   {exists?"Month already snapshotted":"Freeze completed month"}
  </button>
  {snapshots.length===0?<p className="text-sm text-slate-600">
   No archived operational months in this business.</p>:
   <ul className="divide-y">
    {snapshots.map(s=><li key={s.id}
     className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
     <div>
      <strong>{s.month} · {s.status}</strong>
      <p className="mt-1 text-xs text-slate-600">
       Captured {s.createdAt.slice(0,10)} · Fingerprint {s.sourceDigest.slice(0,12)}...
       {s.reviewedAt?` · Reviewed ${s.reviewedAt.slice(0,10)}`:""}
      </p>
     </div>
     <div className="flex flex-wrap gap-3">
      <a href={`/api/chess/operational-close?businessId=${encodeURIComponent(businessId)}&month=${s.month}`}
       className="rounded-md border border-slate-300 px-3 py-2 font-semibold text-slate-800">
       View frozen JSON</a>
      {s.mayReview&&<button type="button" disabled={busy}
       onClick={()=>void request("PATCH",{
        businessId,snapshotId:s.id,
       },"Frozen operational evidence independently reviewed.")}
       className="rounded-md border border-emerald-700 px-3 py-2 font-semibold text-emerald-800 disabled:opacity-40">
       Approve review</button>}
     </div>
    </li>)}
   </ul>}
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </section>;
}
