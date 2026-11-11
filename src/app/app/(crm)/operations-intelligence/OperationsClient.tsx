"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";

type Case={id:string;clientProfileId:string;service:string};
type Invoice={id:string;service:string;descriptionCode:string;amountCents:string;
 status:string;updatedAt:string;clientProfileId:string;serviceCaseId:string};
type Suggestion={id:string;workItemId:string;priority:string;recommendation:string;
 rationaleCode:string;status:string;updatedAt:string};
type WorkItem={id:string;status:string;title:string;dueAt:string|null};
const products:Record<string,string[]>={
 ACCOUNTING:["ACCOUNTING_MONTHLY","ACCOUNTING_PROJECT"],
 BOOKKEEPING:["BOOKKEEPING_MONTHLY","BOOKKEEPING_CLEANUP"],
 PAYROLL:["PAYROLL_PROCESSING"],
 TAX:["TAX_PREPARATION","TAX_PLANNING"],
};
export default function OperationsClient({
 businessId,cases,invoices,suggestions,tasks,billingReady,aiReady,
}:{businessId:string;cases:Case[];invoices:Invoice[];
 suggestions:Suggestion[];tasks:WorkItem[];
 billingReady:boolean;aiReady:boolean}){
 const router=useRouter();
 const [caseId,setCaseId]=useState(cases[0]?.id??"");
 const selected=cases.find(c=>c.id===caseId);
 const [code,setCode]=useState("");
 const [amount,setAmount]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function send(path:string,method:"POST"|"PATCH",data:unknown){
  const response=await fetch(path,{method,credentials:"same-origin",
   headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  if(!response.ok)throw new Error(response.status===403?
   "Access denied: verify independent approval, current client consent and service grants.":
   "Operation unavailable. Check account, source freshness and external provider settings.");
  return response.json() as Promise<unknown>;
 }
 async function perform(work:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setNotice("");
  try{await work();setNotice(success);router.refresh();}
  catch(e){setError(e instanceof Error?e.message:"Operation failed.");}
  finally{setBusy(false);}
 }
 function draft(e:FormEvent){
  e.preventDefault();
  if(!selected)return;
  const cents=Number(amount);
  if(!Number.isSafeInteger(cents)||cents<1||cents>1_000_000_000||
   !products[selected.service]?.includes(code)){
   setError("Provide an approved service code and a whole-cent amount.");
   return;
  }
  perform(()=>send("/api/chess/billing","POST",{
   businessId,clientProfileId:selected.clientProfileId,
   serviceCaseId:selected.id,service:selected.service,
   descriptionCode:code,amountCents:cents,
   requestKey:crypto.randomUUID().replaceAll("-",""),
  }),"Invoice draft saved. An independent authorized manager must approve it.");
 }
 return <div className="space-y-8">
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border border-emerald-200 p-3 text-sm text-emerald-800">{notice}</p>}
  <section className="space-y-3">
   <h2 className="text-xl font-semibold">AI-assisted task triage</h2>
   <p className="text-sm text-slate-600">
    Only task status, deadline category and assignment presence are sent to an
    approved AI gateway. AI cannot read your client content or modify the task.
    Its structured suggestion requires independent human review.
   </p>
   {!aiReady&&<p className="text-xs text-amber-800">
    External AI triage is disabled pending a data-sharing review and provider credentials.
   </p>}
   <ul className="space-y-2">{tasks.slice(0,25).map(task=><li
    key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
    <div><strong className="text-sm">{task.title}</strong>
     <p className="text-xs text-slate-500">{task.status}{task.dueAt?
      ` · Due ${new Date(task.dueAt).toLocaleDateString()}`:""}</p>
    </div>
    <button type="button" disabled={busy||!aiReady}
     onClick={()=>perform(()=>send("/api/chess/ai-triage","POST",{
      businessId,workItemId:task.id,
     }),"AI triage proposal recorded for independent review.")}
     className="rounded-lg border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
     Request structured triage
    </button>
   </li>)}</ul>
   {suggestions.length>0&&<div className="space-y-2">
    <h3 className="font-semibold">Pending human triage decisions</h3>
    {suggestions.slice(0,30).map(s=><div key={s.id}
     className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
     <div className="text-sm">
      <strong>{s.priority} · {s.recommendation.replaceAll("_"," ")}</strong>
      <p className="text-xs text-slate-500">
       {s.rationaleCode.replaceAll("_"," ")} · {s.status}
      </p>
     </div>
     {s.status==="PENDING"&&<div className="flex gap-2">
      {(["ACCEPTED","REJECTED"] as const).map(decision=><button
       key={decision} disabled={busy} type="button"
       onClick={()=>perform(()=>send("/api/chess/ai-triage","PATCH",{
        businessId,workItemId:s.workItemId,suggestionId:s.id,
        decision,expectedUpdatedAt:s.updatedAt,
       }),"Human review recorded; no task state was changed.")}
       className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40">
       {decision==="ACCEPTED"?"Accept advice":"Reject advice"}
      </button>)}
     </div>}
    </div>)}
   </div>}
  </section>
  <section className="space-y-3 border-t border-slate-200 pt-6">
   <h2 className="text-xl font-semibold">Client invoice approvals</h2>
   <p className="text-sm text-slate-600">
    Create only authorized accounting, bookkeeping, payroll and tax service
    invoice drafts. Invoice delivery is not payment collection, recognized
    revenue or an accounting journal posting.
   </p>
   <form onSubmit={draft} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
    <label className="text-sm">Authorized client service case
     <select required value={caseId} onChange={e=>{setCaseId(e.target.value);setCode("");}}
      className="mt-1 block w-full rounded-md border border-slate-300 p-2">
      <option value="">Choose a case</option>
      {cases.map(item=><option key={item.id} value={item.id}>
       {item.service} · Case {item.id}
      </option>)}
     </select>
    </label>
    <label className="text-sm">Service invoice code
     <select value={code} required onChange={e=>setCode(e.target.value)}
      className="mt-1 block w-full rounded-md border border-slate-300 p-2">
      <option value="">Choose a service code</option>
      {(products[selected?.service??""]??[]).map(product=><option value={product} key={product}>
       {product.replaceAll("_"," ")}
      </option>)}
     </select>
    </label>
    <label className="text-sm">Invoice amount in cents (USD)
     <input required type="number" min={1} max={1000000000} step={1}
      value={amount} onChange={e=>setAmount(e.target.value)}
      className="mt-1 block w-full rounded-md border border-slate-300 p-2"/>
    </label>
    <div className="flex items-end">
     <button type="submit" disabled={busy||cases.length===0}
      className="rounded-lg bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
      Create invoice draft
     </button>
    </div>
   </form>
   {!billingReady&&<p className="text-xs text-amber-800">
    External invoice delivery is off until vendor certification, consent and provider setup.
   </p>}
   {invoices.length===0?<p className="text-sm text-slate-600">No invoices recorded for this business.</p>:
    <ul className="space-y-2">{invoices.slice(0,50).map(invoice=><li key={invoice.id}
     className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
     <div>
      <strong className="text-sm">{invoice.descriptionCode.replaceAll("_"," ")} ·
       {(Number(invoice.amountCents)/100).toLocaleString("en-US",{
        style:"currency",currency:"USD"})}</strong>
      <p className="text-xs text-slate-600">Status {invoice.status} · Invoice {invoice.id}</p>
     </div>
     <div className="flex flex-wrap gap-2">
      {invoice.status==="DRAFT"&&(["APPROVED","REJECTED"] as const).map(decision=>
       <button type="button" key={decision} disabled={busy}
        onClick={()=>perform(()=>send("/api/chess/billing","PATCH",{
         businessId,invoiceId:invoice.id,decision,
         expectedUpdatedAt:invoice.updatedAt,
        }),"Invoice review recorded; no invoice was sent or charged.")}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40">
        {decision==="APPROVED"?"Approve":"Reject"}
       </button>)}
      {invoice.status==="APPROVED"&&<button type="button" disabled={busy||!billingReady}
       onClick={()=>perform(()=>send("/api/chess/billing-delivery","POST",{
        businessId,invoiceId:invoice.id,
       }),"Invoice-delivery attempt recorded. No payment was collected.")}
       className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
       Request invoice delivery
      </button>}
      {["UNKNOWN","SENT"].includes(invoice.status)&&<button type="button"
       disabled={busy||!billingReady}
       onClick={()=>perform(()=>send("/api/chess/billing-delivery","PATCH",{
        businessId,invoiceId:invoice.id,
       }),"Remote invoice status checked without resubmitting delivery.")}
       className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40">
       Reconcile vendor status
      </button>}
     </div>
    </li>)}</ul>}
  </section>
 </div>;
}
