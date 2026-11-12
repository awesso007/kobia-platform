"use client";
import * as React from "react";
import {useState} from "react";
import {useRouter} from "next/navigation";

type Account={id:string;code:string;name:string;type:string};
type Transaction={
 id:string;postedDate:string;description:string;amountCents:string;
 bankAccountId:string;
};
type PostingPreview={
 reviewId:string;transactionDigest:string;bankTransactionId:string;
 lines:{accountId:string;debitCents:string;creditCents:string}[];
 totalDebitCents:string;totalCreditCents:string;postedToLedger:false;
};
type Review={
 id:string;status:string;legacyBankTransactionId:string;
 suggestedAccountId:string|null;approvedAccountId:string|null;
 confidenceBasisPoints:number|null;updatedAt:string;
};
export default function BankReviewClient({
 businessId,clientProfileId,serviceCaseId,service,transactions,accounts,reviews,postingEnabled,
}:{businessId:string;clientProfileId:string;serviceCaseId:string;
 service:"ACCOUNTING"|"BOOKKEEPING";transactions:Transaction[];
 accounts:Account[];reviews:Review[];postingEnabled:boolean}){
 const router=useRouter();
 const [choices,setChoices]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [prepared,setPrepared]=useState<PostingPreview|null>(null);
 const [reconciliation,setReconciliation]=useState<Record<string,{status:string;journalEntryId:string|null}>>({});
 const [typedConfirmation,setTypedConfirmation]=useState("");
 const [attested,setAttested]=useState(false);
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
 async function preview(review:Review){
  setPrepared(null);setTypedConfirmation("");setAttested(false);
  setBusy(review.id);setError("");setNotice("");
  try{
   const query=new URLSearchParams({businessId,clientProfileId,
    serviceCaseId,service,reviewId:review.id});
   const response=await fetch("/api/chess/bank-posting-preview?"+query.toString(),{
    method:"GET",credentials:"same-origin",cache:"no-store",
   });
   if(!response.ok)throw new Error(response.status===403?
    "A third independent authorized owner/admin with current client consent is required.":
    "The bank transaction or approved review is no longer eligible for a preview.");
   const result=await response.json() as Omit<PostingPreview,"reviewId">;
   if(result.postedToLedger!==false || result.lines.length!==2||
    !/^[a-f0-9]{64}$/.test(result.transactionDigest))
    throw new Error("Unexpected posting preview response.");
   setPrepared({...result,reviewId:review.id});
   setNotice("READ-ONLY balanced journal proposal: "+
    result.lines.map(l=>"account "+l.accountId+" debit "+l.debitCents+
     " / credit "+l.creditCents+" cents").join("; ")+
    ". Total debit = total credit = "+result.totalDebitCents+
    " cents. Nothing was posted or matched.");
  }catch(e){setError(e instanceof Error?e.message:"Preview unavailable.");}
  finally{setBusy(null);}
 }

 async function reconcile(review:Review){
  setBusy(review.id);setError("");setNotice("");
  try{
   const qs=new URLSearchParams({businessId,clientProfileId,serviceCaseId,
    service,reviewId:review.id});
   const response=await fetch("/api/chess/bank-reconciliation?"+qs.toString(),{
    method:"GET",credentials:"same-origin",cache:"no-store",
   });
   if(!response.ok)throw new Error(response.status===403?
    "Access denied. The client service, consent or posted review may no longer be authorized.":
    "Source-to-ledger reconciliation could not be confirmed.");
   const result=await response.json() as {outcome?:{
    status:string;journalEntryId:string|null;bankSettled:boolean;
    requiresIndependentReview:boolean;
   }};
   if(!result.outcome||!["UNPOSTED","MATCHED_POSTED","DIVERGED","UNKNOWN"]
    .includes(result.outcome.status)||result.outcome.bankSettled!==false)
    throw new Error("Invalid ledger evidence response.");
   const outcome=result.outcome;
   setReconciliation(old=>({...old,[review.id]:{
    status:outcome.status,journalEntryId:outcome.journalEntryId,
   }}));
   setNotice(outcome.status==="MATCHED_POSTED"?
    "Posted journal "+outcome.journalEntryId+
    " matched the bank categorization record and two balanced lines."+
    " This does not establish cash settlement or statement reconciliation.":
    outcome.status==="UNPOSTED"?
    "No matching CHESS journal was posted for this review. This read-only check did not retry or post.":
    "A ledger evidence discrepancy/unknown outcome requires an independent"+
    " accountant to review the source record. Do not retry automatically.");
  }catch(e){setError(e instanceof Error?e.message:"Reconciliation unavailable.");}
  finally{setBusy(null);}
 }
 async function post(review:Review){
  const plan=prepared;
  if(!postingEnabled||!plan||plan.reviewId!==review.id||!attested||
   typedConfirmation!=="POST LEDGER ENTRY"||busy!==null)return;
  setBusy(review.id);setError("");setNotice("");
  try{
   const response=await fetch("/api/chess/bank-posting",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,clientProfileId,serviceCaseId,service,
     reviewId:review.id,expectedTransactionDigest:plan.transactionDigest}),
   });
   if(!response.ok)throw new Error(response.status===403?
    "Posting rejected. Verify current approvals, assignment, consent, period and ledger mapping.":
    "Posting outcome is not confirmed. Do not resubmit blindly; inspect the bank source and ledger journal first.");
   const posted=await response.json() as {
    postedToLedger:boolean;journalEntryId:string;replay:boolean;bankSettled:boolean;
   };
   if(posted.postedToLedger!==true||typeof posted.journalEntryId!=="string")
    throw new Error("Posting receipt is incomplete; verify the ledger before retrying.");
   setPrepared(null);setTypedConfirmation("");setAttested(false);
   setNotice("Ledger posting "+(posted.replay?"already recorded":"recorded")+
    ". Journal "+posted.journalEntryId+
    ". Bank settlement and statement reconciliation are NOT confirmed.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Outcome unknown. Check the ledger before retrying.");}
  finally{setBusy(null);}
 }
 return <section className="space-y-4">
  <h2 className="text-xl font-semibold">Bank transaction categorization</h2>
  <p className="text-sm text-slate-600">Existing unmatched ledger transactions only.
   Suggestions and approvals do not post an accounting entry.
   Financial execution is separately approved and disabled by default.</p>
  {error&&<p role="alert" className="rounded-lg border border-red-200 p-3 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border border-emerald-200 p-3 text-sm text-emerald-800">{notice}</p>}
  {reviews.some(review=>review.status==="APPROVED")&&
   <section className="space-y-3 rounded-xl border bg-white p-4" aria-label="Approved bank review reconciliation">
    <h3 className="font-semibold">Verify previous ledger posting (read-only)</h3>
    <p className="text-xs text-slate-600">This verifies the original bank transaction, posted journal reference
     and balanced general-ledger lines. It cannot confirm bank settlement,
     undo a posting or authorize a retry.</p>
    <ul className="space-y-3">
     {reviews.filter(review=>review.status==="APPROVED").map(review=>
      <li key={review.id} className="flex flex-wrap items-center gap-3 text-sm">
       <span className="break-all text-slate-700">Review {review.id}</span>
       <button type="button" disabled={busy!==null} onClick={()=>void reconcile(review)}
        className="rounded border border-emerald-800 px-3 py-2 font-semibold text-emerald-900 disabled:opacity-40">
        Check legacy journal
       </button>
       {reconciliation[review.id]&&<span role="status" className="font-semibold">
        {reconciliation[review.id]?.status.replaceAll("_"," ")}
       </span>}
      </li>)}
    </ul>
   </section>}
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
      {review?.status==="APPROVED"&&<button disabled={busy!==null}
       onClick={()=>preview(review)}
       className="rounded-md border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-40">
       Preview balanced entry (no posting)
      </button>}
      {postingEnabled&&review?.status==="APPROVED"&&prepared?.reviewId===review.id&&
       <section aria-label="Independent ledger posting confirmation"
        className="mt-3 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h4 className="text-sm font-semibold text-amber-950">
         Financial posting: third independent operator
        </h4>
        <p className="text-xs leading-5 text-amber-900">
         Review both journal lines. The bank source fingerprint is bound to
         this preview. Approval does not prove deposit settlement,
         final reconciliation, or valid tax treatment. This action changes
         the legacy general ledger and cannot be casually undone.
        </p>
        <table className="w-full text-left text-xs">
         <thead><tr><th className="py-1">GL account</th>
          <th className="py-1 text-right">Debit (cents)</th>
          <th className="py-1 text-right">Credit (cents)</th></tr></thead>
         <tbody>{prepared.lines.map((line,index)=><tr key={line.accountId+"-"+index}>
          <td className="py-1">{accounts.find(a=>a.id===line.accountId)?.name??line.accountId}</td>
          <td className="py-1 text-right">{line.debitCents}</td>
          <td className="py-1 text-right">{line.creditCents}</td>
         </tr>)}</tbody>
         <tfoot><tr className="border-t font-semibold">
          <td>Total</td><td className="text-right">{prepared.totalDebitCents}</td>
          <td className="text-right">{prepared.totalCreditCents}</td>
         </tr></tfoot>
        </table>
        <label className="flex items-start gap-2 text-xs text-amber-950">
         <input type="checkbox" checked={attested}
          onChange={e=>setAttested(e.target.checked)}/>
         I am the third independent authorized operator. I checked the
         review, account mapping, current client consent and accounting period.
        </label>
        <label className="block text-xs font-semibold text-amber-950">
         Type POST LEDGER ENTRY to confirm
         <input value={typedConfirmation}
          onChange={e=>setTypedConfirmation(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded border border-amber-300 p-2"/>
        </label>
        <button type="button" disabled={busy!==null||!attested||
         typedConfirmation!=="POST LEDGER ENTRY"}
         onClick={()=>void post(review)}
         className="rounded-md bg-amber-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
         Post approved journal to ledger
        </button>
       </section>}
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
