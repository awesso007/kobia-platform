import {formatChessUsdCents} from "@/lib/chess/report-format";
import Link from "next/link";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {selectChessWorkspace} from "@/lib/chess/workspace-selection";
import {getChessOperationsReport} from "@/lib/chess/operations-reporting";
import {listChessInvoices,listChessBillableCases} from "@/lib/chess/billing";
import {listChessWorkItemTriage} from "@/lib/chess/ai-triage";
import {listChessWorkItems} from "@/lib/chess/workflow";
import {billingProviderConfigured} from "@/lib/chess/billing-provider";
import {aiTriageConfigured} from "@/lib/chess/ai-triage-provider";
import OperationsClient from "./OperationsClient";
export const dynamic="force-dynamic";
export default async function OperationsIntelligencePage({
 searchParams,
}:{searchParams:{businessId?:string;month?:string}}){
 const denied=<main role="alert" className="mx-auto max-w-5xl p-8">
  Operational intelligence requires an active business administrator.
 </main>;
 try{
  const units=await listBusinessUnits();
  const workspace=selectChessWorkspace(units,searchParams.businessId);
  if(workspace.status!=="READY")return <main role="status"
   className="mx-auto max-w-5xl space-y-3 p-8">
   <h1 className="text-2xl font-semibold">Operations intelligence unavailable</h1>
   <p className="text-sm text-slate-700">{workspace.status==="UNAVAILABLE"?
    "The requested business is not available to your account; another business was not selected.":
    "No active business unit is assigned to this workspace."}</p>
   <Link href="/app/chess-desk" className="text-sm font-semibold text-emerald-800 underline">
    Return to service desk
   </Link>
  </main>;
  const selected=workspace.selected;
  const month=/^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(searchParams.month??"")?
   searchParams.month!:new Date().toISOString().slice(0,7);
  const [report,invoices,cases,suggestions,tasks]=await Promise.all([
   getChessOperationsReport({businessId:selected.id,month}),
   listChessInvoices(selected.id),listChessBillableCases(selected.id),
   listChessWorkItemTriage(selected.id),listChessWorkItems(selected.id),
  ]);
  const metrics=[
   ["Cases created",report.caseCounts.reduce((s,v)=>s+v.count,0)],
   ["Work items created",report.taskCounts.reduce((s,v)=>s+v.count,0)],
   ["AI reviews created",report.aiReviewCounts.reduce((s,v)=>s+v.count,0)],
   ["Regulated coordination cases",report.regulatedCoordinationCounts.reduce((s,v)=>s+v.count,0)],
  ] as const;
  return <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
   <header>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS CORP 2 · Milestone 7
    </p>
    <h1 className="mt-2 text-3xl font-semibold">AI automation, billing and reporting</h1>
    <p className="mt-2 text-sm text-slate-600">
     Business-unit-specific operational intelligence with supervised AI and
     independently approved billing. This is not a consolidated financial statement.
    </p>
   </header>
   <nav aria-label="Milestone 7 workspaces" className="flex flex-wrap gap-3 text-sm">
    <Link href={`/app/ai-operations?businessId=${encodeURIComponent(selected.id)}`} className="rounded-lg border px-4 py-2 font-semibold text-emerald-800">AI review queue</Link>
    <Link href={`/app/service-billing?businessId=${encodeURIComponent(selected.id)}`} className="rounded-lg border px-4 py-2 font-semibold text-emerald-800">Invoice approval desk</Link>
    <Link href={`/app/operations-reports?businessId=${encodeURIComponent(selected.id)}&month=${month}`} className="rounded-lg border px-4 py-2 font-semibold text-emerald-800">Monthly reports</Link>
   </nav>
   <nav className="flex flex-wrap gap-2" aria-label="Choose business">
    {units.map(u=><Link key={u.id}
     href={`/app/operations-intelligence?businessId=${encodeURIComponent(u.id)}&month=${month}`}
     className={`rounded-lg border px-3 py-2 text-sm
      ${u.id===selected.id?"bg-emerald-900 text-white":"border-slate-200"}`}>
     {u.name}
    </Link>)}
   </nav>
   <section className="space-y-4">
    <h2 className="text-xl font-semibold">Monthly operational report</h2>
    <div className="flex flex-wrap items-center gap-4 text-sm">
     <p>UTC reporting month: <strong>{month}</strong></p>
     <Link href={`/api/chess/operations-report?businessId=${encodeURIComponent(selected.id)}&month=${month}&format=csv`}
      className="font-semibold text-emerald-800 hover:underline">
      Export aggregate CSV report
     </Link>
     <Link href={`/api/chess/operations-report/portfolio?month=${month}&format=csv`}
      className="font-semibold text-emerald-800 hover:underline">
      Export all-business operational CSV (owner/admin)
     </Link>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     {metrics.map(([label,value])=><div key={label}
      className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
     </div>)}
    </div>
    <h3 className="text-lg font-semibold">Invoice amounts by delivery status</h3>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
     {Object.entries(report.invoiceCountsAndAmounts).map(([status,data])=>
      <div key={status} className="rounded-lg border border-slate-200 p-4">
       <p className="text-sm font-semibold">{status.replaceAll("_"," ")}</p>
       <p className="text-sm text-slate-600">{data.invoices} invoices</p>
       <strong className="text-xl">
        {formatChessUsdCents(data.amountCents)}
       </strong>
      </div>)}
    </div>
    <p className="text-xs text-slate-600">
     Report categories are grouped by record creation month and current state.
     Sent means a vendor has acknowledged delivery, not that the client has
     received the invoice, paid it or that revenue has been earned.
    </p>
   </section>
   <OperationsClient key={selected.id}
    businessId={selected.id}
    aiReady={aiTriageConfigured()}
    billingReady={billingProviderConfigured()}
    cases={cases} invoices={invoices.map(x=>({
     ...x,updatedAt:x.updatedAt.toISOString(),
    }))}
    suggestions={suggestions.map(x=>({
     ...x,updatedAt:x.updatedAt.toISOString(),
     appliedAt:x.appliedAt?.toISOString()??null,
    }))}
    tasks={tasks.map(x=>({...x,
     dueAt:x.dueAt?.toISOString()??null,
    }))}/>
  </main>;
 }catch{return denied;}
}
