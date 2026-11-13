"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
type Service="ACCOUNTING"|"BOOKKEEPING"|"PAYROLL"|"TAX";
export default function FinancialEntityMappingClient({
 businessId,clientProfileId,serviceCaseId,service,mappingStatus,
}:{
 businessId:string;clientProfileId:string;serviceCaseId:string;
 service:Service;mappingStatus:"LINKED"|"UNLINKED"|"UNAVAILABLE";
}){
 const router=useRouter();
 const [legacyEntityId,setLegacyEntityId]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function map(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy||mappingStatus!=="UNLINKED"||!legacyEntityId.trim())return;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/chess/finance",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,clientProfileId,serviceCaseId,
     service,legacyEntityId:legacyEntityId.trim()}),
   });
   if(!response.ok)throw new Error(response.status===403?
    "The entity, consent, service case or business authorization is not valid.":
    response.status===400?"Enter a valid existing entity ID.":
    "Entity mapping was not recorded. It may already exist.");
   setMessage("The existing same-tenant ledger entity has been linked. No journal entry or payroll transaction was created.");
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:"Unable to link entity.");}
  finally{setBusy(false);}
 }
 return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-xl font-semibold">Accounting entity link</h2>
  <p className="text-sm text-slate-600">
   Authorized administrators can connect this active case to an
   existing ledger entity in the same KOBIA tenant. The server
   validates the tenant and entity; this never posts a journal,
   initiates payroll, or transfers funds.
  </p>
  {mappingStatus==="LINKED"?<p role="status" className="text-sm text-emerald-800">
   An active ledger entity link exists for this case.
  </p>:mappingStatus==="UNAVAILABLE"?<p role="alert" className="text-sm text-amber-800">
   The ledger mapping status cannot be verified. Entity changes are disabled.
  </p>:<form onSubmit={map} className="flex flex-wrap items-end gap-3">
    <label className="min-w-[220px] flex-1 text-sm font-semibold">
     Existing same-tenant ledger entity record ID
     <input required maxLength={128} value={legacyEntityId}
      onChange={e=>setLegacyEntityId(e.target.value)}
      className="mt-1 block w-full rounded-md border p-2"
      placeholder="Use an internal entity ID, not a tax ID"/>
    </label>
    <button type="submit" disabled={busy||!legacyEntityId.trim()}
     className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
     {busy?"Linking...":"Link existing entity"}
    </button>
   </form>}
  {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </section>;
}
