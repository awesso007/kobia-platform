import Link from "next/link";
import OperationsClient from "../operations-intelligence/OperationsClient";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {selectChessWorkspace} from "@/lib/chess/workspace-selection";
import {listChessInvoices,listChessBillableCases} from "@/lib/chess/billing";
import {billingProviderConfigured} from "@/lib/chess/billing-provider";
import {merchantWebhookConfigured,listChessMerchantObservations}
 from "@/lib/chess/merchant-observations";
import MerchantEventsPanel from "./MerchantEventsPanel";
import {listChessRecurringPlans,recurringInvoiceDraftsEnabled}
 from "@/lib/chess/recurring-billing";
import RecurringPlansPanel from "./RecurringPlansPanel";
export const dynamic="force-dynamic";
export default async function ServiceBillingPage({searchParams}:{
 searchParams:{businessId?:string};
}){
 try{
  const units=await listBusinessUnits();
  const workspace=selectChessWorkspace(units,searchParams.businessId);
  if(workspace.status!=="READY")return <main role="status"
   className="mx-auto max-w-4xl space-y-3 p-8">
   <h1 className="text-2xl font-semibold">Billing workspace unavailable</h1>
   <p className="text-sm text-slate-700">
    {workspace.status==="UNAVAILABLE"?
     "The requested business is not available to your current role. No other business was selected.":
     "No active billing business unit is available."}
   </p>
   <Link href="/app/chess-desk" className="text-sm font-semibold text-emerald-800 underline">
    Return to service desk
   </Link>
  </main>;
  const selected=workspace.selected;
  const [invoices,cases,merchantEvents,plans]=await Promise.all([
   listChessInvoices(selected.id),listChessBillableCases(selected.id),
   listChessMerchantObservations(selected.id),
   listChessRecurringPlans(selected.id),
  ]);
  const drafts=invoices.filter(x=>x.status==="DRAFT").length;
  const approvals=invoices.filter(x=>x.status==="APPROVED").length;
  const unresolved=invoices.filter(x=>
   ["UNKNOWN","SUBMITTING"].includes(x.status)).length;
  return <main className="mx-auto max-w-6xl space-y-7 px-6 py-8">
   <header>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS / Service billing
    </p>
    <h1 className="mt-2 text-3xl font-semibold">Invoice approval desk</h1>
    <p className="mt-2 max-w-3xl text-sm text-slate-600">
     Create service-linked invoice drafts, review independently, deliver only
     through an approved external invoice-only gateway, reconcile uncertain
     responses, or void an unsent draft. This screen never charges a client.
    </p>
   </header>
   <nav aria-label="Billing business" className="flex flex-wrap gap-2">
    {units.map(u=><Link key={u.id}
     href={`/app/service-billing?businessId=${encodeURIComponent(u.id)}`}
     aria-current={u.id===selected.id?"page":undefined}
     className={`rounded-lg border px-3 py-2 text-sm ${u.id===selected.id?
      "bg-emerald-900 text-white":"bg-white text-slate-700"}`}>
     {u.name}</Link>)}
   </nav>
   <section aria-label="Invoice queue summary" className="grid gap-3 sm:grid-cols-3">
    {([["Drafts to review",drafts],["Approved to send",approvals],
      ["Needs provider reconciliation",unresolved]] as const).map(([label,value])=>
     <div key={label} className="rounded-xl border bg-white p-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
     </div>)}
   </section>
   <OperationsClient key={selected.id} view="billing" businessId={selected.id}
    cases={cases} invoices={invoices.map(i=>({...i,
     updatedAt:i.updatedAt.toISOString()}))}
    suggestions={[]} tasks={[]} aiReady={false}
    billingReady={billingProviderConfigured()}/>
   <RecurringPlansPanel key={selected.id} businessId={selected.id} cases={cases}
    schedulerEnabled={recurringInvoiceDraftsEnabled()}
    plans={plans.map(p=>({
     ...p,nextDraftAt:p.nextDraftAt.toISOString(),
     lastDraftAt:p.lastDraftAt?.toISOString()??null,
     lastInspectedAt:p.lastInspectedAt?.toISOString()??null,
     approvedAt:p.approvedAt?.toISOString()??null,
     createdAt:p.createdAt.toISOString(),
     updatedAt:p.updatedAt.toISOString(),
    }))}/>
   <MerchantEventsPanel configured={merchantWebhookConfigured()}
    events={merchantEvents.map(e=>({
     ...e,occurredAt:e.occurredAt.toISOString(),
     receivedAt:e.receivedAt.toISOString(),
    }))}/>
   <p className="text-xs text-slate-600">
    External SENT means vendor acknowledgment only. VOID is available only
    before a delivery attempt. Payments, tax calculations and ledger postings
    require separate approved integrations.
   </p>
  </main>;
 }catch{
  return <main role="alert" className="p-8">
   Active owner/admin access with current client billing grants and consent
   is required for the invoice workspace.
  </main>;
 }
}
