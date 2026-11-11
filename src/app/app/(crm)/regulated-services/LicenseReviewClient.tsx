"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

type Credential={
 id:string;clerkUserId:string;service:string;credentialType:string;
 jurisdiction:string;status:string;credentialRegistryId:string|null;
 verifiedAt:string|null;registryCheckedAt:string|null;expiresAt:string|null;
};
export default function LicenseReviewClient({businessId,viewerId,registryConfigured,credentials}:{
 businessId:string;viewerId:string;registryConfigured:boolean;credentials:Credential[];
}){
 const router=useRouter();
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function verify(credentialId:string){
  if(busy||!registryConfigured)return;
  setBusy(credentialId);setError("");setMessage("");
  try{
   const res=await fetch("/api/chess/license-verify",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({credentialId,businessId}),
   });
   if(!res.ok)throw new Error(res.status===403?
    "Independent verification is not allowed for this account or credential.":
    "Official registry check unavailable or its response did not pass the validation policy.");
   const result=await res.json();
   setMessage(result?.verified?
    "Official active registry evidence was recorded. Firm affiliation must be verified independently.":
    "Official registry evidence did not verify this license. It remains ineligible.");
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:"License check failed.");}
  finally{setBusy("");}
 }
 return <section className="space-y-3">
  <h2 className="text-xl font-semibold">Official practitioner-license checks</h2>
  <p className="text-sm text-slate-600">
   Authorized administrators may verify an independent employee
   credential through an approved official registry. No status is
   granted by manual entry or by this screen alone.
  </p>
  {!registryConfigured&&<p role="status" className="rounded-lg border border-amber-200 p-3 text-sm text-amber-900">
   Registry gateway is not configured. All verification actions are disabled.
  </p>}
  {credentials.length===0?<p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-600">
   No previously registered credentials are available in this business.
   Credential intake and external registry contracts require separate approval.
  </p>:<ul className="space-y-2">
   {credentials.map(c=>{
    const canCheck=registryConfigured&&c.clerkUserId!==viewerId&&
     !!c.credentialRegistryId;
    return <li key={c.id}
     className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
     <div className="space-y-1">
      <p className="text-sm font-semibold text-slate-900">
       {c.service.replaceAll("_"," ")} · {c.credentialType}
      </p>
      <p className="text-xs text-slate-600">
       Jurisdiction {c.jurisdiction} · {c.status}
      </p>
      <p className="text-xs text-slate-600">
       Last checked {c.registryCheckedAt?c.registryCheckedAt.slice(0,10):"Never"}
       {c.expiresAt?` · Expires ${c.expiresAt.slice(0,10)}`:""}
      </p>
     </div>
     <button type="button" disabled={!canCheck||!!busy}
      onClick={()=>void verify(c.id)}
      className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
      title={!canCheck?"Independent administrator and configured source required":undefined}>
      {busy===c.id?"Verifying...":"Verify with official source"}
     </button>
    </li>;
   })}
  </ul>}
  {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </section>;
}
