"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

type Case={id:string;clientProfileId:string;service:"ACCOUNTING"|"BOOKKEEPING"};
type Connection={id:string;serviceCaseId:string;legacyBankAccountId:string;
 active:boolean;createdAt:string;updatedAt:string};
export default function FinanceBankFeedClient({businessId,providerConfigured,cases,connections}:{
 businessId:string;providerConfigured:boolean;cases:Case[];connections:Connection[];
}){
 const router=useRouter();
 const [caseId,setCaseId]=useState(cases[0]?.id??"");
 const [bankId,setBankId]=useState("");
 const [providerRef,setProviderRef]=useState("");
 const [since,setSince]=useState(new Date(Date.now()-30*86400000).toISOString().slice(0,10));
 const [ack,setAck]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 async function send(method:"POST"|"PATCH",url:string,body:object,success:string){
  if(busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   const res=await fetch(url,{
    method,credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
   });
   if(!res.ok)throw new Error(res.status===403?
    "You need a current client service grant, explicit bank-feed consent, and owner/admin access.":
    res.status===400?"Check the configured account reference and date range.":
    "The bank feed operation was not completed. No ledger posting occurred.");
   const result=await res.json();
   setMessage(success);router.refresh();
   return result;
  }catch(e){setError(e instanceof Error?e.message:"Bank feed operation failed.");}
  finally{setBusy(false);}
 }
 const choice=cases.find(c=>c.id===caseId);
 return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-xl font-semibold">Bank-feed connections and imports</h2>
  <p className="text-sm text-slate-700">
   Administrators can register an approved bank-account mapping, pause a
   connection, or import posted transactions as UNMATCHED ledger items only.
   No posting, reconciliation approval, transfer, ACH or account balance
   change happens through this screen.
  </p>
  {!providerConfigured&&<p role="status" className="rounded-lg border border-amber-200 p-3 text-sm text-amber-900">
   The approved Plaid gateway and bank-feed import flags are not configured.
   Activation and import remain disabled.
  </p>}
  {cases.length>0&&<form className="grid gap-3 rounded-lg border border-slate-100 p-4 sm:grid-cols-2"
   onSubmit={e=>{
    e.preventDefault();if(!choice)return;
    void send("POST","/api/chess/bank-feed",{
     businessId,clientProfileId:choice.clientProfileId,serviceCaseId:choice.id,
     service:choice.service,legacyBankAccountId:bankId.trim(),
     providerAccountRef:providerRef.trim(),
    },"Bank connection mapping registered as inactive pending verification.");
   }}>
   <h3 className="sm:col-span-2 font-semibold">Register a validated account mapping</h3>
   <label className="text-sm font-semibold">Approved active service case
    <select value={caseId} onChange={e=>setCaseId(e.target.value)}
     className="mt-1 block w-full rounded-md border p-2">
     {cases.map(c=><option key={c.id} value={c.id}>
      {c.service} · {c.id}
     </option>)}
    </select></label>
   <label className="text-sm font-semibold">Existing ledger bank-account record ID
    <input required maxLength={128} value={bankId} onChange={e=>setBankId(e.target.value)}
     className="mt-1 block w-full rounded-md border p-2"
     placeholder="Internal record ID, never a bank account number"/></label>
   <label className="text-sm font-semibold sm:col-span-2">Approved opaque provider account reference
    <input required pattern="[A-Za-z0-9_-]{6,160}" value={providerRef}
     onChange={e=>setProviderRef(e.target.value)}
     className="mt-1 block w-full rounded-md border p-2"
     placeholder="Vault-approved reference; not a login, routing or account number"/>
   </label>
   <button type="submit" disabled={busy||!choice||!bankId||!providerRef}
    className="w-fit rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
    Register inactive connection</button>
  </form>}
  <div className="space-y-2">
   <h3 className="font-semibold">Existing mapped connections</h3>
   {connections.length===0?<p className="text-sm text-slate-600">
    No bank-feed connections registered in this business.
   </p>:<ul className="divide-y">
    {connections.map(c=><li key={c.id} className="space-y-3 py-4">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="text-sm">
       <p className="font-semibold">{c.active?"Active":"Paused"} bank feed</p>
       <p className="text-xs text-slate-600">
        Service case {c.serviceCaseId} · Ledger bank record {c.legacyBankAccountId}
       </p>
      </div>
      <button type="button" disabled={busy||(!c.active&&!providerConfigured)}
       className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40"
       onClick={()=>void send("PATCH","/api/chess/bank-feed",
        {businessId,connectionId:c.id,active:!c.active},
        c.active?"Bank feed paused.":"Bank feed activated after the server rechecked consent and provider configuration.")}>
       {c.active?"Pause":"Activate after consent checks"}
      </button>
     </div>
     {c.active&&providerConfigured&&<form className="flex flex-wrap items-end gap-3"
      onSubmit={e=>{
       e.preventDefault();if(!ack||!since)return;
       const sinceAt=new Date(`${since}T00:00:00.000Z`).toISOString();
       void send("POST","/api/chess/bank-feed/import",
        {businessId,connectionId:c.id,sinceAt,acknowledgeUnmatched:true},
        "Bank transactions imported to the UNMATCHED queue only. Independent categorization and approval are still required.");
      }}>
      <label className="text-sm font-semibold">Import posted items from UTC date (last 90 days)
       <input type="date" required value={since} onChange={e=>setSince(e.target.value)}
        className="mt-1 block rounded-md border p-2"/>
      </label>
      <label className="flex items-center gap-2 text-sm">
       <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
       I understand imports remain unmatched
      </label>
      <button type="submit" disabled={busy||!ack||!since}
       className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
       Import unmatched transactions</button>
     </form>}
    </li>)}
   </ul>}
  </div>
  {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </section>;
}
