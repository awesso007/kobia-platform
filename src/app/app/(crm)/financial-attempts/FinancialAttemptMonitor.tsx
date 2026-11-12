import type {ChessFinancialAttemptState} from "@/lib/chess/bank-financial-attempt";
import {financialAttemptStates} from "@/lib/chess/financial-attempt-health";

export type AttemptMonitorProps={
 counts:Record<ChessFinancialAttemptState,number>;
 oldestUnconfirmedAt:string|null;
 recent:readonly {status:ChessFinancialAttemptState;reservedAt:string;updatedAt:string}[];
};
const explanations:Record<ChessFinancialAttemptState,string>={
 RESERVED:"Reserved in CHESS; not proof of a ledger write",
 EXECUTING:"Ledger outcome is in progress or not yet confirmed",
 UNKNOWN:"Commit acknowledgement ambiguous; independent review required",
 COMMITTED:"Journal reference recorded; settlement is not proven",
 FAILED:"Outcome was explicitly resolved as failed; review the source",
 CANCELLED:"Reservation cancelled before execution",
};

/** Pure read-only presentation, deliberately without retry/repost controls. */
export default function FinancialAttemptMonitor({
 counts,oldestUnconfirmedAt,recent,
}:AttemptMonitorProps){
 const uncertain=counts.EXECUTING+counts.UNKNOWN;
 const total=financialAttemptStates.reduce((sum,status)=>sum+counts[status],0);
 return <div className="space-y-6">
  <section aria-label="Posting attempt status counts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   {financialAttemptStates.map(status=><article key={status}
    className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-sm font-semibold text-slate-900">{status.replaceAll("_"," ")}</h2>
    <p className="mt-2 text-3xl font-semibold tabular-nums">{counts[status]}</p>
    <p className="mt-1 text-xs leading-5 text-slate-600">{explanations[status]}</p>
   </article>)}
  </section>
  <section aria-label="Unconfirmed ledger attempts"
   className="rounded-xl border border-amber-300 bg-amber-50 p-5">
   <h2 className="text-lg font-semibold text-amber-950">Independent ledger review</h2>
   <p className="mt-2 text-sm leading-6 text-amber-950">
    {uncertain>0?
     `${uncertain} execution or UNKNOWN attempt(s) require source-to-ledger investigation.`:
     "No EXECUTING or UNKNOWN attempts were found in this business snapshot."}
    {oldestUnconfirmedAt?
     ` Oldest unconfirmed reservation: ${oldestUnconfirmedAt.slice(0,19).replace("T"," ")} UTC.`:""}
   </p>
   <p className="mt-2 text-xs leading-5 text-amber-950">
    Do not retry an ambiguous bank posting or treat COMMITTED as cash settled.
    Investigate the authorized client case with an independent accountant,
    reconcile the existing legacy journal and source transaction, and follow
    approved incident procedures. This monitoring screen cannot execute,
    reverse, confirm or settle a journal entry.
   </p>
  </section>
  <section aria-label="Recent posting attempt timeline" className="space-y-3">
   <h2 className="text-lg font-semibold text-slate-900">Latest attempt states</h2>
   <p className="text-xs text-slate-600">
    Showing at most 25 business-scoped events. No client names, transaction
    amounts, bank account numbers, ledger IDs or source receipts are displayed.
   </p>
   {total===0?<p role="status" className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
    No financial posting attempts in this business yet.
   </p>:<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className="w-full text-left text-sm">
     <thead className="bg-slate-50 text-slate-700"><tr>
      <th scope="col" className="p-3">Reserved (UTC)</th>
      <th scope="col" className="p-3">Last state change (UTC)</th>
      <th scope="col" className="p-3">Status</th>
     </tr></thead>
     <tbody>{recent.map((attempt,index)=><tr
      key={attempt.reservedAt+"-"+index} className="border-t border-slate-100">
      <td className="p-3">{attempt.reservedAt.slice(0,19).replace("T"," ")}</td>
      <td className="p-3">{attempt.updatedAt.slice(0,19).replace("T"," ")}</td>
      <td className="p-3 font-semibold">{attempt.status}</td>
     </tr>)}</tbody>
    </table>
   </div>}
  </section>
 </div>;
}
