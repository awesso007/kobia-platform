"use client";
import {formatChessUsdCents} from "@/lib/chess/report-format";
type Row={
 id:string;invoiceId:string;eventKind:string;amountCents:string;
 currency:string;status:string;occurredAt:string;receivedAt:string;
};
export default function MerchantEventsPanel({events,configured}:{
 events:Row[];configured:boolean;
}){
 return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-xl font-semibold">Merchant collection observations</h2>
  <p className="text-sm text-slate-700">
   Signed provider events are stored for independent investigation.
   A provider claim of payment, refund or chargeback is NOT proof that
   funds cleared the bank, that a refund was released, that revenue is
   earned, or that a journal entry was posted.
  </p>
  {!configured&&<p role="status" className="text-sm text-amber-900">
   Merchant webhook ingestion is disabled until the payment vendor
   contract, verification key and settlement policy are approved.
  </p>}
  {events.length===0?<p className="text-sm text-slate-600">
   No merchant observations are visible for currently authorized invoices.
  </p>:<div className="overflow-x-auto">
   <table className="w-full text-left text-sm">
    <thead><tr className="border-b">
     <th scope="col" className="p-2">Event</th>
     <th scope="col" className="p-2">Invoice</th>
     <th scope="col" className="p-2">Reported amount</th>
     <th scope="col" className="p-2">Observed UTC</th>
     <th scope="col" className="p-2">Review status</th>
    </tr></thead>
    <tbody>{events.map(e=><tr key={e.id} className="border-b">
     <td className="p-2">{e.eventKind.replaceAll("_"," ")}</td>
     <td className="p-2 font-mono text-xs">{e.invoiceId}</td>
     <td className="p-2 tabular-nums">{formatChessUsdCents(e.amountCents)}</td>
     <td className="p-2">{e.occurredAt.slice(0,10)}</td>
     <td className="p-2">Unsettled · {e.status}</td>
    </tr>)}</tbody>
   </table>
  </div>}
  <p className="text-xs text-slate-600">
   Financial close, refunds, account debits, ACH and cash reconciliation
   remain disabled and require separately certified merchant and ledger
   execution processes.
  </p>
 </section>;
}
