import Link from "next/link";
import type {Metadata} from "next";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {assertBusinessManager} from "@/lib/chess/business-manager";
import {getChessFinancialAttemptHealth} from "@/lib/chess/financial-attempt-health";
import FinancialAttemptMonitor from "./FinancialAttemptMonitor";

export const dynamic="force-dynamic";
export const metadata:Metadata={
 title:"CHESS bank posting attempt monitor",
 robots:{index:false,follow:false},
};

/**
 * Manager-only, tenant-scoped financial exception observation.
 * No provider credentials, money movement, ambiguous retry or mutation.
 */
export default async function ChessFinancialAttemptsPage({searchParams}:{
 searchParams:{businessId?:string};
}){
 try{
  const assignedUnits=await listBusinessUnits();
  const units=(await Promise.all(assignedUnits.map(async unit=>{
   try{await assertBusinessManager(unit.id);return unit;}
   catch{return null;}
  }))).filter((unit):unit is (typeof assignedUnits)[number]=>unit!==null);
  const selected=units.find(unit=>unit.id===searchParams.businessId)??units[0];
  if(!selected)return <main role="alert" className="p-8">
   No active business-manager assignment is available for this monitor.
  </main>;
  const health=await getChessFinancialAttemptHealth(selected.id);
  return <main className="mx-auto max-w-6xl space-y-7 px-6 py-10">
   <header className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS · Banking and ledger controls
    </p>
    <h1 className="text-3xl font-semibold text-slate-950">Financial posting attempt monitor</h1>
    <p className="max-w-3xl text-sm leading-6 text-slate-700">
     Inspect the reservation, execution and uncertain-outcome states of
     separately approved bookkeeping and accounting journal attempts.
     This is an operational status view, not a bank balance, GL close,
     money movement, or confirmation of settlement.
    </p>
   </header>
   <nav aria-label="Financial attempt business" className="flex flex-wrap gap-2">
    {units.map(unit=><Link key={unit.id}
     href={`/app/financial-attempts?businessId=${encodeURIComponent(unit.id)}`}
     aria-current={unit.id===selected.id?"page":undefined}
     className={`rounded-lg border px-3 py-2 text-sm font-medium ${unit.id===selected.id?
      "bg-emerald-900 text-white":"border-slate-300 text-slate-800"}`}>
     {unit.name}
    </Link>)}
   </nav>
   <p className="text-sm text-slate-700">
    Showing only attempts from <strong>{selected.name}</strong>.
    Every read requires a current business-manager role and an immutable
    tenant-local access decision.
   </p>
   <FinancialAttemptMonitor
    counts={health.counts}
    oldestUnconfirmedAt={health.oldestUnconfirmedAt?.toISOString()??null}
    recent={health.recent.map(item=>({
     status:item.status,
     reservedAt:item.reservedAt.toISOString(),
     updatedAt:item.updatedAt.toISOString(),
    }))}/>
   <nav aria-label="Financial exception follow-up" className="flex flex-wrap gap-4 text-sm font-semibold">
    <Link href={`/app/finance-operations?businessId=${encodeURIComponent(selected.id)}`}
     className="text-emerald-800 underline">Open authorized finance cases</Link>
    <Link href="/app/work-items" className="text-emerald-800 underline">
     Open employee work queue</Link>
   </nav>
  </main>;
 }catch{
  return <main role="alert" className="mx-auto max-w-4xl p-8">
   Financial attempt monitoring requires current manager authorization
   for the selected business. No private attempt details were returned.
  </main>;
 }
}
