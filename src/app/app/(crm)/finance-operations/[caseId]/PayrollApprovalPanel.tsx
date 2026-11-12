"use client";
import * as React from "react";
import {useState} from "react";
import {useRouter} from "next/navigation";

type ApprovalRow={id:string;status:string;requestedBy:string;
 createdAt:string;reviewedAt:string|null;canReview:boolean};
type Evidence={
 source:{legacyPayRunId:string;payDate:string;grossCents:string;
  netCents:string;taxCents:string};
 approvals:ApprovalRow[];
};

/** Request from a verified POSTED pay run, not browser-entered payroll
 * totals or a hand-created digest. Decisions require a different admin. */
export default function PayrollApprovalPanel({
 businessId,clientProfileId,serviceCaseId,requestsEnabled,canReview,
}:{businessId:string;clientProfileId:string;serviceCaseId:string;
 requestsEnabled:boolean;canReview:boolean}){
 const router=useRouter();
 const [runId,setRunId]=useState("");
 const [ack,setAck]=useState(false);
 const [reviewAck,setReviewAck]=useState(false);
 const [evidence,setEvidence]=useState<Evidence|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const source={businessId,clientProfileId,serviceCaseId,legacyPayRunId:runId.trim()};
 async function requestApproval(){
  if(!requestsEnabled||busy||!ack||!source.legacyPayRunId)return;
  setBusy(true);setError("");setNotice("");setEvidence(null);
  try{
   const res=await fetch("/api/chess/payroll-approvals",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(source),
   });
   if(!res.ok)throw new Error(res.status===403?
    "Approval cannot be requested: confirm the active client grant, posted pay run, case mapping and your current assignment.":
    "Unable to confirm the approval request. Check the queue before submitting again.");
   const value=await res.json() as {approval?:{id:string;status:string}};
   if(!value.approval?.id)throw new Error("Approval request receipt is incomplete.");
   setNotice("Payroll review "+value.approval.id+" is "+value.approval.status+
    ". A different authorized administrator must inspect this exact run. No wages were transmitted.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Approval request failed.");}
  finally{setBusy(false);}
 }
 async function inspect(){
  if(!canReview||busy||!source.legacyPayRunId)return;
  setBusy(true);setError("");setNotice("");setEvidence(null);setReviewAck(false);
  try{
   const query=new URLSearchParams(source);
   const res=await fetch("/api/chess/payroll-approvals?"+query.toString(),{
    credentials:"same-origin",cache:"no-store",
   });
   if(!res.ok)throw new Error(res.status===403?
    "A current independent owner/admin with specific client service consent is required.":
    "The pay run is not POSTED, scoped to this case or available for review.");
   const reply=await res.json() as {evidence?:Evidence};
   if(!reply.evidence?.source||!Array.isArray(reply.evidence.approvals))
    throw new Error("No trusted payroll evidence returned.");
   setEvidence(reply.evidence);
  }catch(e){setError(e instanceof Error?e.message:"Review evidence unavailable.");}
  finally{setBusy(false);}
 }
 async function decide(id:string,decision:"APPROVED"|"REJECTED"){
  if(!canReview||!evidence||!reviewAck||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch("/api/chess/payroll-approvals",{
    method:"PATCH",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...source,approvalId:id,decision}),
   });
   if(!res.ok)throw new Error(res.status===403?
    "Decision rejected: recheck source fingerprint, requester independence, live consent and current assignment.":
    "Review decision not confirmed. Reinspect before attempting another decision.");
   const payload=await res.json() as {review?:{id:string;status:string}};
   if(!payload.review?.id)throw new Error("Decision receipt not confirmed.");
   setNotice("Source-bound approval "+payload.review.id+" is "+payload.review.status+
    ". This does not submit, pay or settle payroll.");
   setReviewAck(false);setEvidence(null);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Review decision unavailable.");}
  finally{setBusy(false);}
 }
 return <section className="space-y-4 rounded-xl border bg-white p-5" aria-label="Payroll source-bound approval review">
  <div>
   <h2 className="text-xl font-semibold">Review a posted payroll run</h2>
   <p className="mt-2 text-sm leading-6 text-slate-700">
    Enter the reference for an already POSTED, mapped payroll run.
    The server computes its exact SHA-256 evidence from the posted run,
    pay date, entity and aggregate totals. A staff member requests review;
    a separate owner/admin independently verifies the source; a third
    authorized person executes only after vendor approval.
   </p>
  </div>
  {!requestsEnabled&&<p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
   New payroll review requests are disabled until internal compliance
   activates the separate approval-workflow switch. Existing approval IDs
   cannot be manufactured from the generic review form.
  </p>}
  <label className="block max-w-xl text-sm font-semibold text-slate-800">
   Exact posted payroll run ID (never employee data)
   <input value={runId} maxLength={128}
    onChange={e=>{setRunId(e.target.value);setEvidence(null);setReviewAck(false);}}
    placeholder="Existing posted run reference"
    className="mt-1 w-full rounded-md border border-slate-300 p-2"/>
  </label>
  {requestsEnabled&&<div className="space-y-3">
   <label className="flex items-start gap-2 text-sm text-slate-800">
    <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
    I checked the selected business, client service consent, linked case and
    posted pay run. This request does not execute payroll.
   </label>
   <button type="button" disabled={busy||!ack||!runId.trim()} onClick={()=>void requestApproval()}
    className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
    Request independent payroll approval
   </button>
  </div>}
  {canReview&&<div className="space-y-3 border-t pt-4">
   <h3 className="font-semibold">Independent reviewer</h3>
   <button type="button" disabled={busy||!runId.trim()} onClick={()=>void inspect()}
    className="rounded-md border border-emerald-900 px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-40">
    Inspect this run and matching requests
   </button>
   {evidence&&<div className="space-y-3 rounded-md border border-slate-200 p-4">
    <h4 className="text-sm font-semibold">Server-verified posted run (aggregate only)</h4>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
     <div><dt className="text-slate-500">Run</dt><dd className="break-all font-medium">{evidence.source.legacyPayRunId}</dd></div>
     <div><dt className="text-slate-500">Pay date</dt><dd className="font-medium">{evidence.source.payDate.slice(0,10)}</dd></div>
     <div><dt className="text-slate-500">Gross cents</dt><dd className="font-medium">{evidence.source.grossCents}</dd></div>
     <div><dt className="text-slate-500">Net cents</dt><dd className="font-medium">{evidence.source.netCents}</dd></div>
     <div><dt className="text-slate-500">Taxes cents</dt><dd className="font-medium">{evidence.source.taxCents}</dd></div>
    </dl>
    <p className="text-xs text-slate-600">
     These are aggregate accounting totals, not independently verified
     employee wage deposits, bank funding, taxes paid or provider settlement.
    </p>
    <label className="flex items-start gap-2 text-sm">
     <input type="checkbox" checked={reviewAck}
      onChange={e=>setReviewAck(e.target.checked)}/>
     I independently verified the source and supporting payroll evidence
     and am not the requester or intended executing operator.
    </label>
    {evidence.approvals.length===0?<p className="text-sm text-slate-600">
     No existing request has this exact source fingerprint.</p>:
     <ul className="divide-y">{evidence.approvals.map(a=><li key={a.id}
      className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="text-sm">
       <strong>{a.status}</strong>
       <p className="break-all text-xs text-slate-600">Approval {a.id}</p>
       <p className="text-xs text-slate-600">Requested {a.createdAt.slice(0,10)}</p>
      </div>
      {a.canReview&&requestsEnabled?<div className="flex gap-2">
       <button type="button" disabled={busy||!reviewAck}
        onClick={()=>void decide(a.id,"APPROVED")}
        className="rounded-md bg-emerald-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
        Approve this posted run
       </button>
       <button type="button" disabled={busy||!reviewAck}
        onClick={()=>void decide(a.id,"REJECTED")}
        className="rounded-md border border-red-700 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-40">
        Reject
       </button>
      </div>:<span className="text-xs text-slate-600">
       {a.status==="PENDING"?"Another eligible reviewer required":"Decision recorded"}
      </span>}
     </li>)}</ul>}
   </div>}
  </div>}
  {notice&&<p role="status" className="rounded-md border border-emerald-300 p-3 text-sm text-emerald-900">{notice}</p>}
  {error&&<p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-900">{error}</p>}
 </section>;
}
