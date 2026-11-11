import Link from "next/link";
import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getPlatformDb} from "@/lib/db/platform";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {CHESS_DEMO_SLUG,CHESS_DEMO_SCHEMA,chessDemoModeActive} from "@/lib/chess/demo-mode";
import {ensureChessDemoOwnerMembership} from "@/lib/chess/demo-owner";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"CHESS fictional demo",robots:{index:false,follow:false}};

const paths:Record<string,{href:string;label:string;description:string}>={
 accounting:{href:"/app/finance-operations",label:"Accounting",description:"Explore accounting review queues. No ledger posting."},
 bookkeeping:{href:"/app/finance-operations",label:"Bookkeeping",description:"Review bookkeeping workflows. No bank feeds connected."},
 payroll:{href:"/app/finance-operations",label:"Payroll",description:"See payroll coordination. No wages are funded."},
 tax:{href:"/app/finance-operations",label:"Tax",description:"View tax work queues. No returns are filed."},
 mortgage:{href:"/app/regulated-services",label:"Mortgage",description:"Intake coordination only. No loans originated."},
 insurance:{href:"/app/regulated-services",label:"Insurance",description:"Intake coordination only. No policies bound."},
 homes:{href:"/app/regulated-services",label:"Real estate",description:"Review service handoffs. No agreements executed."},
 investments:{href:"/app/regulated-services",label:"Investments",description:"Coordination only. No advice or securities trades."},
};

export default async function ChessDemoTour(){
 if(!chessDemoModeActive())notFound();
 const {db,tenantId,schemaName}=getTenantDb();
 if(tenantId!==CHESS_DEMO_SLUG||schemaName!==CHESS_DEMO_SCHEMA)notFound();
 await ensureChessDemoOwnerMembership();
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))notFound();
 const registry=await getPlatformDb().tenantRegistry.findUnique({
  where:{slug:CHESS_DEMO_SLUG},select:{status:true,plan:true,schemaName:true},
 });
 if(!registry||registry.status!=="ACTIVE"||registry.plan!=="DEMO"||
  registry.schemaName!==CHESS_DEMO_SCHEMA)notFound();

 const [units,profiles,employeeCount]=await Promise.all([
  db.chessBusinessUnit.findMany({where:{slug:{in:Object.keys(paths)},status:"ACTIVE"},
   select:{id:true,slug:true,name:true,assignments:{where:{revokedAt:null},select:{id:true}}},
   orderBy:{name:"asc"}}),
  db.clientProfile.findMany({where:{displayName:{endsWith:"(FICTIONAL)"}},
   select:{id:true,displayName:true},take:5,orderBy:{displayName:"asc"}}),
  db.membership.count({where:{status:"ACTIVE",
   clerkUserId:{in:["user_fictional_chess_manager",
    "user_fictional_chess_staff_one","user_fictional_chess_staff_two"]}}}),
 ]);
 const sampleTasks=await db.chessWorkItem.findMany({
  where:{businessId:{in:units.map(u=>u.id)},
   title:{startsWith:"Fictional "}},select:{businessId:true,status:true},
 });
 const counts=new Map<string,number>();
 for(const task of sampleTasks)counts.set(task.businessId,(counts.get(task.businessId)??0)+1);
 return <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
  <header className="space-y-3">
   <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
    KOBIA independent SaaS / CHESS first tenant
   </p>
   <h1 className="text-3xl font-semibold text-slate-950">
    CHESS Corporation fictional sandbox
   </h1>
   <p className="max-w-3xl text-sm leading-6 text-slate-700">
    This test-only tour reads fictional tenant data. It cannot originate
    mortgages, bind insurance, file taxes, move money, post a ledger,
    or bypass client consent, staff permissions or professional licensing.
    No external service integrations are activated.
   </p>
  </header>
  <section className="grid gap-3 sm:grid-cols-3" aria-label="Fictional demo totals">
   {([["CHESS business units",units.length],["Fictional employees",employeeCount],
     ["Fictional client profiles",profiles.length]] as const).map(([title,count])=>
     <div key={title} className="rounded-xl border bg-white p-5">
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p>
     </div>)}
  </section>
  <section aria-labelledby="demo-services" className="space-y-4">
   <h2 id="demo-services" className="text-xl font-semibold">Explore all eight CHESS services</h2>
   <div className="grid gap-4 md:grid-cols-2">
    {units.map(unit=>{
     const workflow=paths[unit.slug];
     if(!workflow)return null;
     return <article key={unit.id} className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div><h3 className="font-semibold">{workflow.label}</h3>
        <p className="mt-1 text-xs text-slate-600">{unit.name}</p></div>
       <span className="text-xs font-medium text-emerald-800">FICTIONAL</span>
      </div>
      <p className="mt-3 text-sm text-slate-700">{workflow.description}</p>
      <p className="mt-3 text-xs text-slate-600">
       {unit.assignments.length} sample assignments / {counts.get(unit.id)??0} sample work items
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-emerald-800">
       <Link href={workflow.href+"?businessId="+encodeURIComponent(unit.id)}
        className="underline">Open workflow</Link>
       <Link href={"/app/work-items?businessId="+encodeURIComponent(unit.id)}
        className="underline">View work items</Link>
      </div>
     </article>;
    })}
   </div>
  </section>
  <section className="rounded-xl border bg-white p-5">
   <h2 className="font-semibold">Sample client relationships</h2>
   <p className="mt-1 text-sm text-slate-600">
    No valid service grants or accepted consents are seeded. Administrative
    access to a name never grants access to any service-specific record.
   </p>
   <ul className="mt-3 grid gap-2 sm:grid-cols-2">
    {profiles.map(profile=><li className="text-sm text-slate-700" key={profile.id}>
     {profile.displayName}</li>)}
   </ul>
   <Link href="/app/client-profiles" className="mt-4 inline-block text-sm font-semibold text-emerald-800 underline">
    Open client relationship directory
   </Link>
  </section>
  <Link href="/app/overview" className="inline-block text-sm font-semibold text-emerald-800 underline">
   Return to workspace overview
  </Link>
 </main>;
}
