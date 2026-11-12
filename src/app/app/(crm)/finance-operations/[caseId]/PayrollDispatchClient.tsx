"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";
type Dispatch={id:string;legacyPayRunId:string;status:string;
 submittedAt:string|null;providerCheckedAt:string|null};
/** Existing approved payroll runs only. A human verifies the provider and
 * independent PAYROLL_EXECUTE approval before this disabled-by-default action. */
export default function PayrollDispatchClient({businessId,clientProfileId,dispatches,executionEnabled}:{
 businessId:string;clientProfileId:string;dispatches:Dispatch[];executionEnabled:boolean;
}){
 const router=useRouter();
 const [payRunId,setPayRunId]=useState("");
 const [approvalId,setApprovalId]=useState("");
 const [checked,setChecked]=useState(false);
 const [phrase,setPhrase]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const ready=executionEnabled&&!busy&&!!payRunId.trim()&&!!approvalId.trim()&&
  checked&&phrase==="SUBMIT PAYROLL";
 async function submit(){
  if(!ready)return;
  setBusy(true);setNotice("");setError("");
  try{
   const response=await fetch("/api/chess/payroll-execute",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,clientProfileId,
     legacyPayRunId:payRunId.trim(),approvalId:approvalId.trim()}),
   });
   if(!response.ok)throw new Error(response.status===403?
    "Not authorized: check the posted run, independent approval, consent and mapping.":
    "Payroll outcome uncertain: check the dispatch and provider before retrying.");
   const result=await response.json() as {id?:string;status?:string};
   if(!result.id||!result.status)throw new Error("Invalid receipt: reconcile with provider.");
   setNotice("Dispatch "+result.id+" is "+result.status+
    ". Wage deposits, tax remittances and settlement are not verified.");
   setPayRunId("");setApprovalId("");setChecked(false);setPhrase("");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to confirm provider response.");}
  finally{setBusy(false);}
 }
 return <section aria-label="Payroll provider desk" className="space-y-4">
  <h2 className="text-xl font-semibold">Payroll execution and provider status</h2>
  <p className="text-sm text-slate-700">Provider reports are not bank settlement.
   No wages are calculated or paid automatically on this screen.</p>
  {error&&<p role="alert" className="rounded border border-red-300 p-3 text-sm text-red-900">{error}</p>}
  {notice&&<p role="status" className="rounded border border-emerald-300 p-3 text-sm text-emerald-900">{notice}</p>}
  <div className="overflow-x-auto rounded-xl border bg-white">
   <table className="min-w-full text-left text-sm">
    <thead className="bg-slate-50"><tr>
     <th className="p-3" scope="col">Pay run</th>
     <th className="p-3" scope="col">Provider assertion</th>
     <th className="p-3" scope="col">Submitted</th>
     <th className="p-3" scope="col">Checked</th>
    </tr></thead><tbody>
     {dispatches.map(item=><tr className="border-t" key={item.id}>
      <td className="p-3">{item.legacyPayRunId}</td>
      <td className="p-3">{item.status.replaceAll("_"," ")}</td>
      <td className="p-3">{item.submittedAt?new Date(item.submittedAt).toLocaleString():"Not confirmed"}</td>
      <td className="p-3">{item.providerCheckedAt?new Date(item.providerCheckedAt).toLocaleString():"Not checked"}</td>
     </tr>)}
     {dispatches.length===0&&<tr><td colSpan={4} className="p-4 text-slate-600">
      No external payroll submissions recorded for this service case.
     </td></tr>}
    </tbody>
   </table>
  </div>
  {executionEnabled?<section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
   <h3 className="font-semibold">Submit an independently approved pay run</h3>
   <p className="text-sm text-amber-900">
    The existing pay run must be POSTED in the mapped entity, and a different
    administrator must have approved an exact PAYROLL_EXECUTE action digest.
    The backend independently checks the current consent, grants and people.
    UNKNOWN submissions must never be sent again blindly.
   </p>
   <Link className="text-sm font-semibold underline"
    href={"/app/action-approvals?businessId="+encodeURIComponent(businessId)}>
    Open the independent approval desk
   </Link>
   <div className="grid gap-3 md:grid-cols-2">
    <label className="text-sm font-semibold">Existing posted pay run ID
     <input className="mt-1 block w-full rounded border bg-white p-2" maxLength={128}
      value={payRunId} onChange={e=>setPayRunId(e.target.value)}/>
    </label>
    <label className="text-sm font-semibold">Approved PAYROLL_EXECUTE action ID
     <input className="mt-1 block w-full rounded border bg-white p-2" maxLength={128}
      value={approvalId} onChange={e=>setApprovalId(e.target.value)}/>
    </label>
   </div>
   <label className="flex items-start gap-2 text-sm">
    <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>
    I verified staff independence, payroll totals, funding and the approved provider.
   </label>
   <label className="block text-sm font-semibold">Type SUBMIT PAYROLL
    <input className="mt-1 block w-full max-w-sm rounded border bg-white p-2"
     value={phrase} onChange={e=>setPhrase(e.target.value)}/>
   </label>
   <button type="button" disabled={!ready} onClick={()=>void submit()}
    className="rounded bg-amber-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
    Submit approved run to provider
   </button>
  </section>:<section className="rounded-xl border bg-slate-50 p-4 text-sm">
   <h3 className="font-semibold">External payroll submission disabled</h3>
   <p className="mt-2 text-slate-700">Only read-only provider status is available.
    An approved processor, current licensing/compliance certification and
    independent employee authorization are required to enable submissions.</p>
  </section>}
 </section>;
}
