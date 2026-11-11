import Link from "next/link";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {getChessOperationsReport} from "@/lib/chess/operations-reporting";
import {getChessPortfolioOperationsReport} from "@/lib/chess/operations-portfolio";
import {formatChessUsdCents} from "@/lib/chess/report-format";
import {listChessOperationalSnapshots} from "@/lib/chess/operational-close";
import OperationalCloseClient from "./OperationalCloseClient";
export const dynamic="force-dynamic";

type CountRow={category:string;count:number};
function CountPanel({title,rows}:{title:string;rows:CountRow[]}){
 return <section className="rounded-xl border bg-white p-4">
  <h3 className="font-semibold">{title}</h3>
  {rows.length?<table className="mt-3 w-full text-left text-sm">
   <thead><tr className="border-b text-slate-600">
    <th scope="col" className="py-2">Category</th>
    <th scope="col" className="py-2 text-right">Count</th>
   </tr></thead>
   <tbody>{rows.map(row=><tr key={row.category} className="border-b last:border-0">
    <td className="py-2">{row.category.replaceAll("_"," ")}</td>
    <td className="py-2 text-right tabular-nums">{row.count}</td>
   </tr>)}</tbody>
  </table>:<p className="mt-3 text-sm text-slate-500">No records created in this period.</p>}
 </section>;
}

export default async function ChessReportsPage({searchParams}:{
 searchParams:{businessId?:string;month?:string};
}){
 try{
  const units=await listBusinessUnits();
  const selected=units.find(u=>u.id===searchParams.businessId)??units[0];
  if(!selected)return <main role="status">No active business units available.</main>;
  const month=typeof searchParams.month==="string"&&
   /^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(searchParams.month)?
   searchParams.month:new Date().toISOString().slice(0,7);
  const [report,portfolio,snapshots]=await Promise.all([
   getChessOperationsReport({businessId:selected.id,month}),
   getChessPortfolioOperationsReport(month),
   listChessOperationalSnapshots(selected.id),
  ]);
  const toRows=(rows:readonly {status:string;count:number}[])=>rows.map(x=>({
   category:x.status,count:x.count,
  }));
  const cases=report.caseCounts.map(x=>({category:x.service+" / "+x.status,count:x.count}));
  const regulated=report.regulatedCoordinationCounts.map(x=>({
   category:x.service+" / "+x.status,count:x.count,
  }));
  return <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
   <header>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS / Operations reporting
    </p>
    <h1 className="mt-2 text-3xl font-semibold">Monthly business reports</h1>
    <p className="mt-2 max-w-3xl text-sm text-slate-600">
     Review separate business-unit operational counts and export JSON or CSV.
     These are not historical financial statements, earned revenue,
     payment settlements or statutory consolidated accounts.
    </p>
   </header>
   <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
    <label className="text-sm font-medium">UTC reporting month
     <input type="month" name="month" defaultValue={month}
      min="2020-01" max="2099-12" className="mt-2 block rounded-md border p-2"/>
    </label>
    <label className="text-sm font-medium">Business unit
     <select name="businessId" defaultValue={selected.id}
      className="mt-2 block rounded-md border p-2">
      {units.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}
     </select>
    </label>
    <button type="submit" className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white">
     View report
    </button>
   </form>
   <OperationalCloseClient businessId={selected.id} month={month}
    snapshots={snapshots.map(s=>({
     ...s,createdAt:s.createdAt.toISOString(),
     reviewedAt:s.reviewedAt?.toISOString()??null,
    }))}/>
   <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
     <h2 className="text-xl font-semibold">{selected.name} · {month}</h2>
     <nav aria-label="Business report exports" className="flex gap-4 text-sm">
      <Link className="font-semibold text-emerald-800"
       href={`/api/chess/operations-report?businessId=${encodeURIComponent(selected.id)}&month=${month}&format=json`}>
       JSON export</Link>
      <Link className="font-semibold text-emerald-800"
       href={`/api/chess/operations-report?businessId=${encodeURIComponent(selected.id)}&month=${month}&format=csv`}>
       CSV export</Link>
     </nav>
    </div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
     <CountPanel title="Service cases" rows={cases}/>
     <CountPanel title="Work items" rows={toRows(report.taskCounts)}/>
     <CountPanel title="AI reviews" rows={toRows(report.aiReviewCounts)}/>
     <CountPanel title="Client consent" rows={toRows(report.clientConsentCounts)}/>
     <CountPanel title="Regulated coordination" rows={regulated}/>
     <section className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Invoice face values</h3>
      {Object.entries(report.invoiceCountsAndAmounts).map(([status,data])=>
       <div key={status} className="mt-3 flex justify-between gap-2 border-b pb-2 text-sm">
        <span>{status.replaceAll("_"," ")} ({data.invoices})</span>
        <strong>{formatChessUsdCents(data.amountCents)}</strong>
       </div>)}
      {!Object.keys(report.invoiceCountsAndAmounts).length&&
       <p className="mt-3 text-sm text-slate-500">No invoices created this month.</p>}
     </section>
    </div>
   </section>
   <section className="space-y-4 border-t pt-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
     <div><h2 className="text-xl font-semibold">Current tenant portfolio</h2>
      <p className="text-sm text-slate-600">
       {portfolio.businessCount} active business units. Counts only; companies remain separate.
      </p></div>
     <nav aria-label="Portfolio exports" className="flex gap-4 text-sm">
      <Link className="font-semibold text-emerald-800"
       href={`/api/chess/operations-report/portfolio?month=${month}&format=json`}>
       JSON export</Link>
      <Link className="font-semibold text-emerald-800"
       href={`/api/chess/operations-report/portfolio?month=${month}&format=csv`}>
       CSV export</Link>
     </nav>
    </div>
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
     {([["Service cases",portfolio.totals.cases],
       ["Work items",portfolio.totals.tasks],["AI reviews",portfolio.totals.aiReviews],
       ["Invoices",portfolio.totals.invoices],["Consent records",portfolio.totals.consents],
       ["Regulated workflows",portfolio.totals.regulated]] as const).map(([name,value])=>
      <div key={name} className="rounded-xl border bg-white p-4">
       <p className="text-xs text-slate-600">{name}</p>
       <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </div>)}
    </div>
    <p className="text-sm text-slate-700">
     Total invoice face value, all statuses:
     <strong className="ml-2">{formatChessUsdCents(portfolio.totals.invoiceAmountCents)}</strong>
    </p>
    <div className="overflow-x-auto rounded-xl border bg-white">
     <table className="w-full text-left text-sm">
      <thead><tr className="border-b bg-slate-50">
       <th scope="col" className="p-3">Business unit</th>
       <th scope="col" className="p-3 text-right">Cases</th>
       <th scope="col" className="p-3 text-right">Tasks</th>
       <th scope="col" className="p-3 text-right">Invoices</th>
       <th scope="col" className="p-3 text-right">Invoice face value</th>
      </tr></thead>
      <tbody>{portfolio.businesses.map(b=><tr key={b.businessId}
       className="border-b last:border-0">
       <td className="p-3">{b.businessName}</td>
       <td className="p-3 text-right">{b.caseCounts.reduce((s,x)=>s+x.count,0)}</td>
       <td className="p-3 text-right">{b.taskCounts.reduce((s,x)=>s+x.count,0)}</td>
       <td className="p-3 text-right">{Object.values(b.invoiceCountsAndAmounts)
        .reduce((s,x)=>s+x.invoices,0)}</td>
       <td className="p-3 text-right">{formatChessUsdCents(
        Object.values(b.invoiceCountsAndAmounts).reduce(
         (s,x)=>s+BigInt(x.amountCents),0n).toString())}</td>
      </tr>)}</tbody>
     </table>
    </div>
    <p className="text-xs leading-5 text-slate-600">
     Reporting period is the UTC month in which the record was created;
     status reflects the current workflow state. Invoice amounts are face
     values, not actual client payments. No intercompany elimination, GL
     income, cash balances, medical data, tax returns or client identities
     are included in the portfolio export.
    </p>
   </section>
  </main>;
 }catch{
  return <main role="alert" className="p-8">
   Reporting requires an active tenant owner or administrator with access to
   the selected business unit. No private metrics were disclosed.
  </main>;
 }
}
