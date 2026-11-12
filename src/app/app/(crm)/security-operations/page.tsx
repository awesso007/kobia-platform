import Link from "next/link";
import type {Metadata} from "next";
import {getChessSecurityOverview} from "@/lib/chess/security-overview";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"CHESS security and delivery oversight",robots:{index:false,follow:false}};

function Cell({label,value}:{label:string;value:number}){
 return <div className="rounded-xl border bg-white p-4">
  <p className="text-sm text-slate-600">{label}</p>
  <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
 </div>;
}
/** Read-only operations dashboard, never an alternative to the machine-only
 * incident monitor or an action that can resend uncertain external work. */
export default async function ChessSecurityOperationsPage(){
 try{
  const data=await getChessSecurityOverview();
  const counts=[
   ["Unqueued audit events",data.archive.unqueued],
   ["Pending archive deliveries",data.archive.pending],
   ["Uncertain receipts",data.archive.unknown],
   ["Rejected archive receipts",data.archive.rejected],
   ["Archived receipts",data.archive.archived],
   ["Overdue recurrence schedules",data.overdueSchedules],
  ] as const;
  return <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
   <header className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS · Tenant-only administrative controls
    </p>
    <h1 className="text-3xl font-semibold">Security and worker assurance</h1>
    <p className="max-w-3xl text-sm leading-6 text-slate-700">
     Read-only operational audit and worker exceptions for the currently
     selected KOBIA tenant. No client identities, provider secrets, bank
     details or regulated records are displayed. Source decisions are
     append-only; remote WORM and live incident paging require separate approval.
    </p>
    <p className="text-xs text-slate-600">Observed {new Date(data.observedAt).toLocaleString("en-US")}</p>
   </header>
   <section aria-labelledby="assurance-heading" className="space-y-3">
    <h2 id="assurance-heading" className="text-xl font-semibold">Exception signals</h2>
    <p className="text-sm text-slate-700">
     {data.externalMonitorActivated?
      "The monitoring feature flags are enabled; verify independent paging separately.":
      "External incident paging is not approved or not activated."}
    </p>
    {data.signals.length?<ul className="space-y-2">
     {data.signals.map(signal=><li key={signal}
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
      {signal.replaceAll("_"," ")} · Requires operator review
     </li>)}
    </ul>:<p className="rounded-lg border p-3 text-sm text-slate-700">
     No internal threshold exceptions in this snapshot. This does NOT certify
     live paging, vendor availability, bank reconciliation or disaster recovery.
    </p>}
   </section>
   <section aria-labelledby="archive-heading" className="space-y-3">
    <h2 id="archive-heading" className="text-xl font-semibold">Immutable archive delivery queue</h2>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
     {counts.map(([label,value])=><Cell key={label} label={label} value={value}/>)}
    </div>
    <p className="text-xs text-slate-600">
     UNCERTAIN audit receipts must be reconciled with the provider; never
     blindly resend, reissue signatures, or mark failed exports as archived.
    </p>
   </section>
   <section className="space-y-3">
    <h2 className="text-xl font-semibold">Security decisions (last 24 hours)</h2>
    <div className="flex flex-wrap gap-3">
     {data.auditDecisions.map(row=><div key={row.decision} className="rounded-lg border p-3">
      <p className="text-xs text-slate-600">{row.decision}</p>
      <strong className="text-xl tabular-nums">{row.count}</strong>
     </div>)}
     {!data.auditDecisions.length&&<p className="text-sm text-slate-600">No decisions in the period.</p>}
    </div>
   </section>
   <section className="space-y-3">
    <h2 className="text-xl font-semibold">Latest tenant security events</h2>
    <div className="overflow-x-auto rounded-xl border bg-white">
     <table className="w-full text-left text-sm">
      <thead className="bg-slate-50"><tr>
       <th scope="col" className="p-3">UTC time</th>
       <th scope="col" className="p-3">Event</th>
       <th scope="col" className="p-3">Resource type</th>
       <th scope="col" className="p-3">Decision</th>
      </tr></thead>
      <tbody>{data.recent.map(event=><tr key={event.id} className="border-t">
       <td className="p-3">{event.occurredAt.toISOString().slice(0,19)}Z</td>
       <td className="p-3">{event.action.replaceAll("_"," ")}</td>
       <td className="p-3">{event.resourceType}</td>
       <td className="p-3 font-semibold">{event.decision}</td>
      </tr>)}
      {!data.recent.length&&<tr><td colSpan={4} className="p-4 text-slate-600">
       No security events in this tenant.</td></tr>}</tbody>
     </table>
    </div>
   </section>
   <section className="space-y-3">
    <h2 className="text-xl font-semibold">Machine worker history</h2>
    <div className="overflow-x-auto rounded-xl border bg-white">
     <table className="w-full text-left text-sm">
      <thead className="bg-slate-50"><tr>
       <th scope="col" className="p-3">UTC time</th>
       <th scope="col" className="p-3">Worker</th>
       <th scope="col" className="p-3">Status</th>
       <th scope="col" className="p-3">Processed / Blocked</th>
      </tr></thead>
      <tbody>{data.workers.map((run,i)=><tr key={run.kind+"-"+run.occurredAt.toISOString()+"-"+i} className="border-t">
       <td className="p-3">{run.occurredAt.toISOString().slice(0,19)}Z</td>
       <td className="p-3">{run.kind.replaceAll("_"," ")}</td>
       <td className="p-3">{run.status}</td>
       <td className="p-3">{run.processed} / {run.blocked}</td>
      </tr>)}
      {!data.workers.length&&<tr><td colSpan={4} className="p-4 text-slate-600">
       No recorded worker runs. This is not a healthy heartbeat.</td></tr>}</tbody>
     </table>
    </div>
   </section>
   <nav aria-label="Operations follow-up" className="flex flex-wrap gap-4 text-sm font-semibold text-emerald-900">
    <Link href="/app/work-items" className="underline">Work items and calendar</Link>
    <Link href="/app/operations-reports" className="underline">Monthly operations reports</Link>
    <Link href="/app/overview" className="underline">Return to overview</Link>
   </nav>
  </main>;
 }catch{
  return <main role="alert" className="mx-auto max-w-4xl p-8">
   This security dashboard is available only to a current tenant owner or
   administrator. No cross-tenant audit details were returned.
  </main>;
 }
}
