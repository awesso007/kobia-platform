"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
type Row={id:string;actionType:string;status:string;
 canReview:boolean;createdAt:string;reviewedAt:string|null};
const kinds=[
 ["INTERNAL_PROCESS_REVIEW","Internal process review"],
 ["WORKFLOW_EXCEPTION_REVIEW","Workflow exception"],
 ["ACCESS_POLICY_REVIEW","Access policy review"],
] as const;
async function createRandomDigest(businessId:string,actionType:string){
 // No financial or client data is written into this digest.
 const value=`${businessId}:${actionType}:${crypto.randomUUID()}`;
 const hashed=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return Array.from(new Uint8Array(hashed)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
export default function ApprovalClient({businessId,approvals}:{
 businessId:string;approvals:Row[];
}){
 const router=useRouter();
 const [actionType,setActionType]=useState<string>(kinds[0][0]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function call(method:"POST"|"PATCH",payload:object,success:string){
  if(busy)return;
  setBusy(true);setMessage("");setError("");
  try{
   const res=await fetch("/api/chess/action-approvals",{
    method,credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
   });
   if(!res.ok)throw new Error(res.status===403?
    "This decision is forbidden. A request may not be approved by its creator.":
    "Unable to complete this review request.");
   setMessage(success);router.refresh();
  }catch(err){setError(err instanceof Error?err.message:"Review request failed.");}
  finally{setBusy(false);}
 }
 return <div className="space-y-6">
  <section className="rounded-xl border border-slate-200 bg-white p-5">
   <h2 className="text-lg font-semibold text-slate-900">Request internal review</h2>
   <p className="mt-1 text-sm text-slate-600">
    Select a generic review category only. Do not enter client details
    or confidential financial data. A separate manager must decide.
   </p>
   <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async e=>{
    e.preventDefault();
    try{
     const payloadDigest=await createRandomDigest(businessId,actionType);
     await call("POST",{businessId,actionType,payloadDigest},
      "Review request recorded. An independent administrator must decide.");
    }catch{setError("The browser could not prepare a review fingerprint.");}
   }}>
    <label className="min-w-[240px] flex-1 text-sm font-semibold">
     Review category
     <select value={actionType} onChange={e=>setActionType(e.target.value)}
      className="mt-1 block w-full rounded-md border p-2">
      {kinds.map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select>
    </label>
    <button disabled={busy} type="submit"
     className="rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
     Request review
    </button>
   </form>
  </section>
  <section className="rounded-xl border border-slate-200 bg-white p-5">
   <h2 className="text-lg font-semibold">Review history and pending decisions</h2>
   {approvals.length===0?<p className="mt-3 text-sm text-slate-600">
    No action approvals are visible for your role.
   </p>:<ul className="mt-3 divide-y">
    {approvals.map(a=><li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
     <div>
      <h3 className="text-sm font-semibold text-slate-900">{a.actionType.replaceAll("_"," ")}</h3>
      <p className="mt-1 text-xs text-slate-500">Action reference: <code className="break-all select-all">{a.id}</code></p>
      <p className="text-xs text-slate-600">
       {a.status} · Requested {a.createdAt.slice(0,10)}
       {a.reviewedAt?` · Reviewed ${a.reviewedAt.slice(0,10)}`:""}
      </p>
     </div>
     {a.canReview?<div className="flex gap-2">
      <button type="button" disabled={busy} onClick={()=>void call("PATCH",{
       id:a.id,businessId,decision:"APPROVED"},"Independent review approved."
      )} className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
       Approve</button>
      <button type="button" disabled={busy} onClick={()=>void call("PATCH",{
       id:a.id,businessId,decision:"REJECTED"},"Review rejected."
      )} className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-40">
       Reject</button>
     </div>:<span className="text-xs text-slate-500">
       {a.status==="PENDING"?"Awaiting independent reviewer":"Reviewed"}
      </span>}
    </li>)}
   </ul>}
  </section>
  {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </div>;
}
