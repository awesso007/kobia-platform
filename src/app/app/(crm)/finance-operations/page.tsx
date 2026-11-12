import Link from "next/link";
import {listChessManagedBusinessUnits} from "@/lib/chess/business-manager";
import {selectChessWorkspace} from "@/lib/chess/workspace-selection";
import {getChessFinanceDashboard,listChessAuthorizedFinanceCases} from "@/lib/chess/finance-dashboard";
import {listChessBankFeedConnections} from "@/lib/chess/bank-feed";
import {bankFeedImportConfigured} from "@/lib/chess/bank-feed-provider";
import FinanceBankFeedClient from "./FinanceBankFeedClient";
export const dynamic="force-dynamic";

export default async function ChessFinanceOperationsPage({
 searchParams,
}:{searchParams:{businessId?:string}}){
 let units:Awaited<ReturnType<typeof listChessManagedBusinessUnits>>=[];
 try{units=await listChessManagedBusinessUnits();}catch{
  return <main className="mx-auto max-w-5xl p-8" role="alert">
   Access to finance operations is unavailable.
  </main>;
 }
 const workspace=selectChessWorkspace(units,searchParams.businessId);
 if(workspace.status!=="READY")return <main role="status"
  className="mx-auto max-w-5xl space-y-4 p-8">
  <h1 className="text-2xl font-semibold">Finance workspace unavailable</h1>
  <p className="text-sm text-slate-700">
   {workspace.status==="UNAVAILABLE"?
    "The requested business is not available to your current manager assignment. Select a business you manage.":
    "No active business-manager assignment is available. Ask an administrator to review your unit role."}
  </p>
  <Link href="/app/chess-desk" className="text-sm font-semibold text-emerald-800 underline">
   Return to service desk
  </Link>
 </main>;
 const selected=workspace.selected;
 let report:Awaited<ReturnType<typeof getChessFinanceDashboard>>|null=null;
 let cases:Awaited<ReturnType<typeof listChessAuthorizedFinanceCases>>=[];
 try{[report,cases]=await Promise.all([getChessFinanceDashboard(selected.id),listChessAuthorizedFinanceCases(selected.id)]);}catch{
  return <main className="mx-auto max-w-5xl p-8" role="alert">
   Finance operations require an active business manager assignment.
  </main>;
 }
 let bankConnections:Awaited<ReturnType<typeof listChessBankFeedConnections>>|null=null;
 try{bankConnections=await listChessBankFeedConnections(selected.id);}
 catch{/* Manager without owner/admin rights cannot administer bank feeds. */}
 const bankCases=cases.filter(c=>
  c.service==="ACCOUNTING"||c.service==="BOOKKEEPING")
  .map(c=>({id:c.id,clientProfileId:c.clientProfileId,
   service:c.service as "ACCOUNTING"|"BOOKKEEPING"}));
 const metrics=[
  ["Accounting cases",report.cases.accounting],
  ["Bookkeeping cases",report.cases.bookkeeping],
  ["Payroll cases",report.cases.payroll],
  ["Tax cases",report.cases.tax],
  ["Bank reviews awaiting approval",report.reviews.bankPending],
  ["Bank reviews requiring recheck",report.reviews.bankStale],
  ["Draft tax workpapers",report.reviews.taxDraft],
  ["Tax workpapers awaiting final approval",report.reviews.taxReviewed],
  ["Approved tax workpapers (not filed)",report.reviews.taxApproved],
  ["Payroll outcomes unresolved",report.payroll.unresolved],
  ["Payroll submissions awaiting confirmation",report.payroll.submitted],
  ["Vendor-reported payroll paid (unverified settlement)",report.payroll.vendorReportedPaid],
  ["Enabled bank-feed connections",report.bankFeed.activeConnections],
 ] as const;
 return <main className="mx-auto max-w-6xl space-y-7 px-6 py-10">
  <header>
   <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
    CHESS CORP 2 · Financial operations
   </p>
   <h1 className="mt-2 text-3xl font-semibold text-slate-950">Accounting, bookkeeping, payroll and tax</h1>
   <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
    Operational work queues for the selected business unit. Counts are from
    the active KOBIA tenant, not a consolidation of separate legal entities.
   </p>
  </header>
  <nav aria-label="Select business unit" className="flex flex-wrap gap-2">
   {units.map(u=><Link key={u.id}
    href={`/app/finance-operations?businessId=${encodeURIComponent(u.id)}`}
    aria-current={u.id===selected.id?"page":undefined}
    className={`rounded-lg border px-3 py-2 text-sm font-medium
     ${u.id===selected.id?"bg-emerald-800 text-white":"border-slate-200 text-slate-700"}`}>
    {u.name}
   </Link>)}
  </nav>
  <section aria-labelledby="queue-heading">
   <h2 id="queue-heading" className="mb-3 text-xl font-semibold text-slate-900">
    {selected.name} · Work queue
   </h2>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {metrics.map(([label,value])=><div key={label}
     className="rounded-xl border border-slate-200 bg-white p-4">
     <p className="text-sm text-slate-600">{label}</p>
     <p className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString("en-US")}</p>
    </div>)}
   </div>
  </section>
  <section className="space-y-3">
   <h2 className="text-xl font-semibold">My authorized finance cases</h2>
   {cases.length===0?<div role="status" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-5">
    <p className="font-medium text-slate-900">No authorized finance cases yet</p>
    <p className="text-sm text-slate-700">An administrator must create an active service case,
     grant access to your account, and obtain current client consent before it appears here.</p>
    <Link href="/app/work-items" className="text-sm font-semibold text-emerald-800 underline">
     Continue with your assigned work
    </Link>
   </div>:<ul className="grid gap-3 sm:grid-cols-2">
    {cases.map(item=><li key={item.id} className="rounded-xl border border-slate-200 p-4">
     <strong className="text-sm">{item.service.replaceAll("_"," ")}</strong>
     <p className="mt-1 text-xs text-slate-500">Case reference {item.id}</p>
     <Link href={`/app/finance-operations/${encodeURIComponent(item.id)}?businessId=${encodeURIComponent(selected.id)}`}
      className="mt-2 inline-block text-sm font-semibold text-emerald-700 hover:underline">
      Open client service review
     </Link>
    </li>)}</ul>}
  </section>
  {bankConnections&&<FinanceBankFeedClient key={selected.id}
   businessId={selected.id} providerConfigured={bankFeedImportConfigured()}
   cases={bankCases}
   connections={bankConnections.map(c=>({
    ...c,createdAt:c.createdAt.toISOString(),
    updatedAt:c.updatedAt.toISOString(),
   }))}/>}
  <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
   <h2 className="font-semibold text-amber-950">Bank posting exception monitoring</h2>
   <p className="mt-2 text-sm text-amber-900">
    Inspect reserved, executing and UNKNOWN legacy journal attempts before
    any manual reconciliation. An UNKNOWN outcome must never be blindly retried.
   </p>
   <Link href={`/app/financial-attempts?businessId=${encodeURIComponent(selected.id)}`}
    className="mt-3 inline-block text-sm font-semibold text-amber-950 underline">
    Open read-only financial attempt monitor
   </Link>
  </section>
  <section className="space-y-2 rounded-xl border border-slate-200 p-5">
   <h2 className="font-semibold">Financial controls and activation</h2>
   <p className="text-sm text-slate-600">
    Bank feed imports remain unmatched until independently reviewed in the
    existing ledger. Tax workpaper approval is not an electronic tax filing.
    Payroll provider payment status does not independently verify wage receipt
    or tax deposit settlement. External integrations remain off until approved.
   </p>
  </section>
  <Link href="/app/work-items"
   className="text-sm font-semibold text-emerald-700 hover:underline">
   Open assigned work items and manager queues
  </Link>
 </main>;
}
