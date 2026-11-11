import Link from "next/link";
import OperationsClient from "../operations-intelligence/OperationsClient";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {listChessWorkItemTriage} from "@/lib/chess/ai-triage";
import {listChessWorkItems} from "@/lib/chess/workflow";
import {aiTriageConfigured} from "@/lib/chess/ai-triage-provider";
import {getChessAiDailyUsage} from "@/lib/chess/ai-daily-budget";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {isAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
export const dynamic="force-dynamic";
export default async function AiOperationsPage({searchParams}:{
 searchParams:{businessId?:string};
}){
 try{
  const units=await listBusinessUnits();
  const selected=units.find(u=>u.id===searchParams.businessId)??units[0];
  if(!selected)return <main role="status">No active business unit available.</main>;
  const [suggestions,tasks]=await Promise.all([
   listChessWorkItemTriage(selected.id),listChessWorkItems(selected.id),
  ]);
  const actor=await getCurrentMembership();
  const {db,tenantId}=getTenantDb();
  const canSeeWorker=actor?.status==="ACTIVE"&&
   ["OWNER","ADMIN"].includes(actor.role);
  const scheduled=aiTriageConfigured()&&isAuthorizedWorkflowTenant(tenantId,{
   schedulerEnabled:process.env.CHESS_SCHEDULER_ENABLED,
   allowedTenants:process.env.CHESS_ACTIVE_TENANT_SLUGS,
  });
  const usage=canSeeWorker?await getChessAiDailyUsage(selected.id):null;
  const latestAiRun=canSeeWorker?await db.chessWorkerRun.findFirst({where:{
   kind:"AI_TRIAGE",
  },orderBy:{occurredAt:"desc"},select:{
   status:true,examined:true,processed:true,blocked:true,occurredAt:true,
  }}):null;
  const pending=suggestions.filter(x=>x.status==="PENDING").length;
  const accepted=suggestions.filter(x=>x.status==="ACCEPTED").length;
  const applied=suggestions.filter(x=>!!x.appliedAt).length;
  return <main className="mx-auto max-w-6xl space-y-7 px-6 py-8">
   <header>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS / Supervised operations
    </p>
    <h1 className="mt-2 text-3xl font-semibold">AI task review</h1>
    <p className="mt-2 max-w-3xl text-sm text-slate-600">
     Request privacy-limited task triage, approve or reject independent
     recommendations and create a single approved follow-up. No finance
     postings, regulated decisions or original task changes occur here.
    </p>
   </header>
   <nav aria-label="AI review business" className="flex flex-wrap gap-2">
    {units.map(u=><Link key={u.id}
     href={`/app/ai-operations?businessId=${encodeURIComponent(u.id)}`}
     aria-current={u.id===selected.id?"page":undefined}
     className={`rounded-lg border px-3 py-2 text-sm ${u.id===selected.id?
      "bg-emerald-900 text-white":"bg-white text-slate-700"}`}>
     {u.name}</Link>)}
   </nav>
   <section aria-label="Review queue summary" className="grid gap-3 sm:grid-cols-3">
    {([["Pending review",pending],["Accepted",accepted],
      ["Follow-ups created",applied]] as const).map(([label,value])=>
     <div key={label} className="rounded-xl border bg-white p-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
     </div>)}
   </section>
   {canSeeWorker&&<section aria-label="Automated triage health"
    className="rounded-xl border bg-white p-5">
    <h2 className="text-base font-semibold">Scheduled AI triage</h2>
    <p className="mt-1 text-sm text-slate-600">
     {scheduled?"Configured for the current tenant":"Disabled until provider, privacy and scheduler approvals"}
    </p>
    {latestAiRun?<p className="mt-2 text-sm">
     Last run: {latestAiRun.status} at {latestAiRun.occurredAt.toISOString()}.
     Examined {latestAiRun.examined}; suggestions {latestAiRun.processed};
     blocked {latestAiRun.blocked}.
    </p>:<p className="mt-2 text-sm text-slate-500">
     No recorded AI worker run in this tenant.
    </p>}
   </section>}
   {usage&&<section className="rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="text-base font-semibold">Conservative AI provider call budget</h2>
    <p className="mt-2 text-sm text-slate-700">
     {usage.utcDay} UTC: {usage.reservedCalls} reserved out of {usage.maxCalls}
     approved daily calls for this business.
    </p>
    <p className="mt-1 text-xs text-slate-600">
     Each invocation reserves up to {usage.maxProviderCostMicrosPerCall}
     microdollars; failed calls still count. These are maximum authorized
     request amounts, not actual provider charges or settlement.
    </p>
   </section>}
   <OperationsClient key={selected.id} view="ai" businessId={selected.id}
    suggestions={suggestions.map(s=>({...s,updatedAt:s.updatedAt.toISOString(),
     appliedAt:s.appliedAt?.toISOString()??null}))}
    tasks={tasks.map(t=>({...t,dueAt:t.dueAt?.toISOString()??null}))}
    aiReady={aiTriageConfigured()} billingReady={false}
    invoices={[]} cases={[]}/>
  </main>;
 }catch{
  return <main role="alert" className="p-8">
   Active business-manager access is required for supervised AI review.
  </main>;
 }
}
