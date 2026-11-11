"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

type Account={id:string;code:string;name:string;type:string};
type Transaction={
 id:string;postedDate:string;description:string;amountCents:string;
 bankAccountId:string;
};
type Review={
 id:string;status:string;legacyBankTransactionId:string;
 suggestedAccountId:string|null;approvedAccountId:string|null;
 confidenceBasisPoints:number|null;updatedAt:string;
};
export default function BankReviewClient({
 businessId,clientProfileId,serviceCaseId,service,transactions,accounts,reviews,
}:{businessId:string;clientProfileId:string;serviceCaseId:string;
 service:"ACCOUNTING"|"BOOKKEEPING";transactions:Transaction[];
 accounts:Account[];reviews:Review[]}){
 const router=useRouter();
 const [choices,setChoices]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const prior=new Map(reviews.map(r=>[r.legacyBankTransactionId,r]));
 async function send(url:string,method:"POST"|"PATCH",body:unknown){
  const response=await fetch(url,{
   method,credentials:"same-origin",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(body),
  });
  if(!response.ok)throw new Error(response.status===403?
   "Access denied. A separate authorized reviewer and current client consent are required.":
   "Operation could not be completed. Refresh and verify the current ledger item.");
  return response.json() as Promise<unknown>;
 }
 async function suggest(txn:Transaction){
  setBusy(txn.id);setError("");setNotice("");
  try{
   const accountId=choices[txn.id];
   if(!accountId)throw new Error("Select an offset account first.");
   await send("/api/chess/bank-reviews","POST",{
    businessId,clientProfileId,serviceCaseId,service,
    legacyBankTransactionId:txn.id,suggestedAccountId:accountId,
   });
   setNotice("Suggestion recorded. A different authorized manager must review it. No journal was posted.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Suggestion failed.");}
  finally{setBusy(null);}
 }
 async function decide(review:Review,decision:"APPROVED"|"REJECTED"){
  setBusy(review.id);setError("");setNotice("");
  try{
   await send("/api/chess/bank-reviews","PATCH",{
    businessId,reviewId:review.id,decision,
    ...(decision==="APPROVED"?
     {approvedAccountId:choices[review.legacyBankTransactionId]??
      review.suggestedAccountId}:{}),
    expectedUpdatedAt:review.updatedAt,
   });
   setNotice("Review decision recorded. Use the existing ledger's separately approved posting workflow.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Review failed.");}
  finally{setBusy(null);}
 }
 return <section className="space-y-4">
  <h2 className="text-xl font-semibold">Bank transaction categorization</h2>
  <p className="text-sm text-slate-600">Existing unmatched ledger transactions only.
   Suggestions and approvals do not post an accounting entry.</p>
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border border-emerald-200 p-3 text-sm text-emerald-800">{notice}</p>}
  {transactions.length===0?<p className="text-sm text-slate-600">No unmatched transactions available.</p>:
   <ul className="space-y-3">{transactions.map(txn=>{
    const review=prior.get(txn.id);
    return <li key={txn.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
     <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="font-semibold text-slate-900">{txn.description}</p>
       <p className="text-sm text-slate-600">{new Date(txn.postedDate).toLocaleDateString()}
        {" · "}Signed amount {txn.amountCents} cents</p></div>
      <p className="text-xs font-medium text-slate-500">
       {review?review.status:"NOT REVIEWED"}</p>
     </div>
     <label className="block text-sm">Offset general-ledger account
      <select value={choices[txn.id]??review?.suggestedAccountId??""}
       onChange={e=>setChoices(c=>({...c,[txn.id]:e.target.value}))}
       className="mt-1 block w-full max-w-lg rounded-md border border-slate-300 p-2">
       <option value="">Select a valid account</option>
       {accounts.map(a=><option key={a.id} value={a.id}>
        {a.code} · {a.name} · {a.type}
       </option>)}
      </select>
     </label>
     <div className="flex flex-wrap gap-2">
      {!review&&<button disabled={busy!==null} onClick={()=>suggest(txn)}
       className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
       Propose category
      </button>}
      {review?.status==="PENDING"&&<>
       <button disabled={busy!==null} onClick={()=>decide(review,"APPROVED")}
        className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40">
        Approve review
       </button>
       <button disabled={busy!==null} onClick={()=>decide(review,"REJECTED")}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40">
        Reject
       </button>
      </>}
     </div>
    </li>;
   })}</ul>}
 </section>;
}
