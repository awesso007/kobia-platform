"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import type {VisibleConsentState} from "@/lib/chess/client-consent-self-service";

export default function ConsentControls({consentId,policyVersion,status,tenant}:{
 consentId:string;policyVersion:string;status:VisibleConsentState;tenant:string;
}){
 const router=useRouter();
 const [confirmed,setConfirmed]=useState(false);
 const [loading,setLoading]=useState(false);
 const [complete,setComplete]=useState<"GRANTED"|"WITHDRAWN"|null>(null);
 const [error,setError]=useState("");
 const action=status==="PENDING"?"accept":status==="GRANTED"?"withdraw":null;
 async function submit(){
  if(!action||!confirmed||loading)return;
  setLoading(true);setError("");
  try{
   const res=await fetch(`/api/chess/client-consent?tenant=${encodeURIComponent(tenant)}`,{
    method:action==="accept"?"POST":"DELETE",
    credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(action==="accept"?
     {consentId,policyVersion,accept:true}:{consentId}),
    cache:"no-store",
   });
   if(!res.ok)throw new Error("The request was not recorded. Refresh and try again, or contact your service representative.");
   setComplete(action==="accept"?"GRANTED":"WITHDRAWN");
   setConfirmed(false);
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to update consent.");}
  finally{setLoading(false);}
 }
 if(complete)return <p role="status" className="rounded-lg border border-emerald-200 p-4 text-emerald-900">
  {complete==="GRANTED"?"Your acceptance was recorded.":"Your withdrawal was recorded."}
 </p>;
 if(!action)return <p role="status" className="rounded-lg border border-slate-200 p-4 text-slate-700">
  This disclosure is {status.toLowerCase()}. No further action is available.
 </p>;
 return <section aria-label="Consent decision" className="space-y-4 rounded-lg border border-slate-200 p-5">
  <label className="flex items-start gap-3 text-sm text-slate-800">
   <input type="checkbox" checked={confirmed}
    onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4"/>
   <span>{action==="accept"?
    "I have reviewed the exact disclosure above and expressly consent to its stated purpose.":
    "I understand that withdrawing this permission stops future uses requiring my consent, but does not reverse prior lawful disclosures."}
   </span>
  </label>
  <button type="button" disabled={!confirmed||loading} onClick={submit}
   className="rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
   {loading?"Saving...":action==="accept"?"Accept this disclosure":"Withdraw my consent"}
  </button>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
