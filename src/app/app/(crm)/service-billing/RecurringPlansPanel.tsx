"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {formatChessUsdCents} from "@/lib/chess/report-format";

type BillableCase={id:string;clientProfileId:string;service:string};
type Plan={id:string;businessId:string;clientProfileId:string;
 serviceCaseId:string;service:string;descriptionCode:string;
 amountCents:string;status:string;nextDraftAt:string;
 lastDraftAt:string|null;approvedAt:string|null;
 createdAt:string;updatedAt:string;mayApprove:boolean;mayPause:boolean};
const codes:Record<string,string[]>={
 ACCOUNTING:["ACCOUNTING_MONTHLY","ACCOUNTING_PROJECT"],
 BOOKKEEPING:["BOOKKEEPING_MONTHLY","BOOKKEEPING_CLEANUP"],
 PAYROLL:["PAYROLL_PROCESSING"],
 TAX:["TAX_PREPARATION","TAX_PLANNING"],
};
export default function RecurringPlansPanel({businessId,cases,plans,schedulerEnabled}:{
 businessId:string;cases:BillableCase[];plans:Plan[];schedulerEnabled:boolean;
}){
 const router=useRouter();
 const [caseId,setCaseId]=useState(cases[0]?.id??"");
 const selected=useMemo(()=>cases.find(c=>c.id===caseId),[cases,caseId]);
 const availableCodes=codes[selected?.service??""]??[];
 const [code,setCode]=useState("");
 const [amount,setAmount]=useState("99.00");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function send(method:"POST"|"PATCH"|"DELETE",body:object,success:string){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/chess/recurring-billing",{
    method,credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
   });
   if(!response.ok)throw new Error(response.status===403?
    "An active client billing grant, current consent and independent reviewer are required.":
    response.status===400?"Check the service, amount and billing plan details.":
    "Recurring draft plan unavailable or already exists.");
   setNotice(success);
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to save plan.");}
  finally{setBusy(false);}
 }
 return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-xl font-semibold">Monthly subscription invoice drafts</h2>
  <p className="text-sm text-slate-700">
   Plan creation and separate approval authorize only future invoice DRAFTS.
   Each generated invoice must still receive independent approval and
   delivery review. No automatic charge, refund, bank debit or posting occurs.
  </p>
  <p className="text-xs font-semibold text-slate-600">
   Scheduler: {schedulerEnabled?"Configuration enabled for reviewed tenants":
    "Disabled until subscription and tenant scheduler policies are approved"}
  </p>
  {cases.length>0&&<form className="grid gap-3 sm:grid-cols-3" onSubmit={e=>{
   e.preventDefault();
   if(!selected)return;
   const cents=Math.round(Number(amount)*100);
   if(!Number.isSafeInteger(cents)||cents<1||cents>1_000_000_000){
    setError("Enter a positive amount within the approved limit.");return;
   }
   void send("POST",{
    businessId,clientProfileId:selected.clientProfileId,serviceCaseId:selected.id,
    service:selected.service,descriptionCode:code||availableCodes[0],
    amountCents:cents,
   },"Pending recurring plan created. A different administrator must approve.");
  }}>
   <label className="text-sm font-semibold">Authorized service case
    <select value={caseId} onChange={e=>{setCaseId(e.target.value);setCode("");}}
     className="mt-1 block w-full rounded-md border p-2">
     {cases.map(c=><option key={c.id} value={c.id}>
      {c.service} · {c.id}
     </option>)}
    </select>
   </label>
   <label className="text-sm font-semibold">Recurring service code
    <select value={code||availableCodes[0]||""}
     onChange={e=>setCode(e.target.value)}
     className="mt-1 block w-full rounded-md border p-2">
     {availableCodes.map(c=><option value={c} key={c}>{c.replaceAll("_"," ")}</option>)}
    </select>
   </label>
   <label className="text-sm font-semibold">Monthly USD amount
    <input type="number" min="0.01" max="10000000" step="0.01" required
     value={amount} onChange={e=>setAmount(e.target.value)}
     className="mt-1 block w-full rounded-md border p-2"/>
   </label>
   <button disabled={busy||!selected||!availableCodes.length}
    className="w-fit rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
    Create pending monthly plan
   </button>
  </form>}
  {plans.length===0?<p className="text-sm text-slate-600">
   No recurring draft plans available for currently authorized cases.
  </p>:<ul className="divide-y">
   {plans.map(p=><li key={p.id}
    className="flex flex-wrap items-center justify-between gap-3 py-4">
    <div className="text-sm">
     <p className="font-semibold">
      {p.descriptionCode.replaceAll("_"," ")} · {formatChessUsdCents(p.amountCents)}
     </p>
     <p className="text-xs text-slate-600">
      {p.status} · Next draft {p.nextDraftAt.slice(0,10)}
      {p.lastDraftAt?` · Previous ${p.lastDraftAt.slice(0,10)}`:""}
     </p>
    </div>
    <div className="flex gap-2">
     {p.mayApprove&&<button type="button" disabled={busy}
      onClick={()=>void send("PATCH",{businessId,planId:p.id},
       "Subscription draft schedule independently approved.")}
      className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
      Approve schedule</button>}
     {p.mayPause&&<button type="button" disabled={busy}
      onClick={()=>void send("DELETE",{businessId,planId:p.id},
       "Recurring invoice draft schedule paused.")}
      className="rounded-md border border-red-400 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-40">
      Pause drafts</button>}
    </div>
   </li>)}
  </ul>}
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </section>;
}
