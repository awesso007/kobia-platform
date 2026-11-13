"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
type Service="MORTGAGE"|"INSURANCE"|"REAL_ESTATE"|"INVESTMENTS";
type Checklist={id:string;itemKey:string;completedAt:string|null;evidenceDocumentId:string|null};
type Workflow={id:string;kind:string;status:string;createdAt:string;updatedAt:string;checklist:Checklist[]};
type Document={id:string;fileName:string};
const kinds:Record<Service,string[]>={
 MORTGAGE:["MORTGAGE_APPLICATION_COORDINATION","MORTGAGE_DOCUMENT_INTAKE"],
 INSURANCE:["INSURANCE_COVERAGE_INTAKE","INSURANCE_APPLICATION_COORDINATION"],
 REAL_ESTATE:["REAL_ESTATE_BUYER_INTAKE","REAL_ESTATE_SELLER_INTAKE"],
 INVESTMENTS:["INVESTMENTS_GOAL_DISCOVERY","INVESTMENTS_RISK_DISCOVERY"],
};
export default function RegulatedWorkflowClient({
 businessId,serviceCaseId,service,workflows,documents,partnerReady,
}:{businessId:string;serviceCaseId:string;service:Service;
 workflows:Workflow[];documents:Document[];partnerReady:boolean}){
 const router=useRouter();
 const [kind,setKind]=useState(kinds[service][0]);
 const [documentIds,setDocumentIds]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function request(url:string,method:"POST"|"PATCH",body:unknown){
  const response=await fetch(url,{method,credentials:"same-origin",
   headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(response.status===403?
   "Authorization denied: verify your service grant, current client consent, independent reviewers and official licenses.":
   "The workflow could not advance. Check the current state and partner configuration.");
  return response.json() as Promise<unknown>;
 }
 async function perform(action:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setNotice("");
  try{await action();setNotice(message);router.refresh();}
  catch(e){setError(e instanceof Error?e.message:"Workflow request failed.");}
  finally{setBusy(false);}
 }
 return <section className="space-y-6">
  <header>
   <h2 className="text-xl font-semibold">Service coordination workflows</h2>
   <p className="mt-2 text-sm text-slate-600">These are internal, permissioned
    coordination steps. No underwriting decision, policy issuance, real
    estate offer, investment recommendation or trade can be performed here.
   </p>
  </header>
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border border-emerald-200 p-3 text-sm text-emerald-800">{notice}</p>}
  <form onSubmit={e=>{e.preventDefault();perform(()=>request(
   "/api/chess/regulated-workflows","POST",{
    businessId,serviceCaseId,kind,requestKey:crypto.randomUUID().replaceAll("-",""),
   }),"Draft created; checklist evidence and independent approvals are still required.");}}
   className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4">
   <label className="text-sm">Coordination type
    <select className="mt-1 block rounded-lg border border-slate-300 p-2"
     value={kind} onChange={e=>setKind(e.target.value)}>
     {kinds[service].map(value=><option key={value} value={value}>
      {value.replaceAll("_"," ").toLowerCase()}
     </option>)}
    </select>
   </label>
   <button type="submit" disabled={busy}
    className="rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
    Create internal intake
   </button>
  </form>
  {workflows.length===0?<p className="text-sm text-slate-600">
   No regulated coordination workflows recorded for this service case.
  </p>:<ul className="space-y-4">{workflows.map(workflow=><li key={workflow.id}
   className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
   <div>
    <h3 className="font-semibold">{workflow.kind.replaceAll("_"," ")}</h3>
    <p className="mt-1 text-sm text-slate-600">Internal stage: <strong>{workflow.status}</strong></p>
    <p className="text-xs text-slate-500">Reference {workflow.id}</p>
   </div>
   <div className="space-y-2">
    <h4 className="text-sm font-semibold">Required staff attestations</h4>
    {workflow.checklist.map(item=><div key={item.id}
     className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-2">
     <span className="min-w-0 flex-1 text-sm">{item.itemKey.replaceAll("_"," ")}</span>
     {item.completedAt?<span className="text-xs font-semibold text-emerald-700">
      Recorded {new Date(item.completedAt).toLocaleDateString()}
     </span>:workflow.status==="DRAFT"?<>
      <label className="text-xs">Optional clean document evidence
       <select className="ml-2 rounded-md border border-slate-200 p-1"
        value={documentIds[item.id]??""}
        onChange={e=>setDocumentIds(old=>({...old,[item.id]:e.target.value}))}>
        <option value="">No linked document</option>
        {documents.map(doc=><option value={doc.id} key={doc.id}>{doc.fileName}</option>)}
       </select>
      </label>
      <button disabled={busy} className="rounded-lg border border-emerald-700 px-2 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-40"
       onClick={()=>perform(()=>request("/api/chess/regulated-workflows","PATCH",{
        action:"ATTEST",businessId,serviceCaseId,workflowId:workflow.id,
        itemKey:item.itemKey,
        ...(documentIds[item.id]?{evidenceDocumentId:documentIds[item.id]}:{}),
       }),"Staff attestation recorded, subject to supervisor review.")}>
       Attest
      </button>
     </>:<span className="text-xs text-amber-700">Incomplete</span>}
    </div>)}
   </div>
   <div className="flex flex-wrap gap-2">
    {workflow.status==="DRAFT"&&<button disabled={busy}
     className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
     onClick={()=>perform(()=>request("/api/chess/regulated-workflows","PATCH",{
      action:"DECIDE",businessId,serviceCaseId,workflowId:workflow.id,
      decision:"REVIEW",expectedUpdatedAt:workflow.updatedAt,
     }),"Independent supervisory review recorded.")}>Record review</button>}
    {workflow.status==="REVIEW"&&<button disabled={busy}
     className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40"
     onClick={()=>perform(()=>request("/api/chess/regulated-workflows","PATCH",{
      action:"DECIDE",businessId,serviceCaseId,workflowId:workflow.id,
      decision:"APPROVED",expectedUpdatedAt:workflow.updatedAt,
     }),"Coordination internally approved; partner acknowledgment is separate.")}>Approve coordination</button>}
    {["DRAFT","REVIEW","APPROVED","REJECTED"].includes(workflow.status)&&
     <button disabled={busy}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
      onClick={()=>perform(()=>request("/api/chess/regulated-workflows","PATCH",{
       action:"DECIDE",businessId,serviceCaseId,workflowId:workflow.id,
       decision:"CLOSED",expectedUpdatedAt:workflow.updatedAt,
      }),"Internal workflow closed before any further provider handoff.")}>
      Close internal request</button>}
    {workflow.status==="APPROVED"&&<button disabled={busy||!partnerReady}
     title={partnerReady?"Request opaque coordination ticket":"An approved external partner is not configured"}
     className="rounded-lg border border-emerald-800 bg-emerald-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
     onClick={()=>perform(()=>request("/api/chess/regulated-handoffs","POST",{
      businessId,serviceCaseId,workflowId:workflow.id,
     }),"Provider request recorded; acknowledgment is not a regulated transaction.")}>
     Request external coordination
    </button>}
    {["UNKNOWN","SUBMITTED"].includes(workflow.status)&&
     <button disabled={busy||!partnerReady}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
      onClick={()=>perform(()=>request("/api/chess/regulated-handoffs","PATCH",{
       businessId,serviceCaseId,workflowId:workflow.id,
      }),"Partner coordination status reconciled without resubmitting.")}>
      Check partner ticket status
     </button>}
   </div>
  </li>)}</ul>}
  {!partnerReady&&<p className="rounded-lg border border-amber-200 p-4 text-sm">
   External handoff is disabled. A contracted partner, official affiliation
   verification, separate client handoff consent, and sandbox approval are
   required before coordination can be sent externally.
  </p>}
 </section>;
}
