import Link from "next/link";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {getChessFinanceDashboard} from "@/lib/chess/finance-dashboard";
export const dynamic="force-dynamic";

export default async function ChessFinanceOperationsPage({
 searchParams,
}:{searchParams:{businessId?:string}}){
 let units:Awaited<ReturnType<typeof listBusinessUnits>>=[];
 try{units=await listBusinessUnits();}catch{
  return <main className="mx-auto max-w-5xl p-8" role="alert">
   Access to finance operations is unavailable.
  </main>;
 }
 const selected=units.find(u=>u.id===searchParams.businessId)??units[0];
 if(!selected)return <main className="mx-auto max-w-5xl p-8">
  No active business unit is available to your account.
 </main>;
 let report:Awaited<ReturnType<typeof getChessFinanceDashboard>>|null=null;
 try{report=await getChessFinanceDashboard(selected.id);}catch{
  return <main className="mx-auto max-w-5xl p-8" role="alert">
   Finance operations require an active business manager assignment.
  </main>;
 }
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
