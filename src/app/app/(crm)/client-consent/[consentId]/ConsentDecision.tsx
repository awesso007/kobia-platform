"use client";
import {useState} from "react";
export default function ConsentDecision({consentId,policyVersion}:{consentId:string;policyVersion:string}) {
 const [checked,setChecked]=useState(false);
 const [busy,setBusy]=useState(false);
 const [done,setDone]=useState(false);
 const [error,setError]=useState("");
 async function accept() {
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/chess/client-consent",{
    method:"POST",headers:{"Content-Type":"application/json"},
    credentials:"same-origin",
    body:JSON.stringify({consentId,policyVersion,accept:true}),
   });
   if(!response.ok)throw new Error("Unable to record consent. Please contact your service representative.");
   setDone(true);
  }catch(e){setError(e instanceof Error?e.message:"Consent was not recorded.");}
  finally{setBusy(false);}
 }
 if(done)return <p role="status" className="rounded-lg border border-emerald-200 p-4 font-semibold text-emerald-900">
  Your consent was recorded. You may withdraw it through the authorized client consent process.
 </p>;
 return <div className="space-y-4">
  <label className="flex items-start gap-3 text-sm text-slate-800">
   <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} className="mt-1"/>
   I have read the policy above and expressly agree to the stated purpose.
  </label>
  <button type="button" disabled={!checked||busy} onClick={accept}
   className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
   {busy?"Recording...":"Accept and record consent"}
  </button>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
