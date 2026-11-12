import Link from "next/link";
import * as React from "react";
type DeskItem={title:string;description:string;href:string;tag:string};
const staff:DeskItem[]=[
 {title:"Work and appointments",description:"Assigned tasks, alerts, recurring work and calendar consent.",href:"/app/work-items",tag:"M4"},
 {title:"Client profiles",description:"Tenant-local profiles; service records need individual grants.",href:"/app/client-profiles",tag:"M1 / M3"},
 {title:"Approval inbox",description:"Independent operational review only; not financial execution.",href:"/app/action-approvals",tag:"M7"},
 {title:"My calendar",description:"Calendar view and scheduled commitments.",href:"/app/calendar",tag:"M4"},
];
const manager:DeskItem[]=[
 {title:"Business units and employee access",description:"Assignment, removal and audited revocation of client grants.",href:"/app/business-units",tag:"M2"},
 {title:"Finance case workbench",description:"Bank categorization, ledger reconciliation, tax workpapers and payroll status.",href:"/app/finance-operations",tag:"M5"},
 {title:"Bank posting exceptions",description:"Audited, read-only reservation/UNKNOWN/COMMITTED status without ledger retries.",href:"/app/financial-attempts",tag:"M5 / M8"},
 {title:"Regulated coordination",description:"License checks, consent and licensed partner handoffs.",href:"/app/regulated-services",tag:"M6"},
 {title:"Service billing",description:"Invoice decisions, merchant observations and draft scheduler inspection.",href:"/app/service-billing",tag:"M7"},
 {title:"Supervised AI review",description:"Human-approved task suggestions.",href:"/app/ai-operations",tag:"M7"},
 {title:"Monthly reports",description:"Operational aggregates and snapshots, not statutory financial statements.",href:"/app/operations-reports",tag:"M7"},
 {title:"Operations intelligence",description:"Business workload, invoice and AI review summaries.",href:"/app/operations-intelligence",tag:"M7"},
 {title:"Security and worker assurance",description:"Audit decisions, archival exceptions and worker health; read only.",href:"/app/security-operations",tag:"M8"},
];
function Group({name,description,items}:{name:string;description:string;items:DeskItem[]}){
 return <section className="space-y-3" aria-label={name}>
  <h2 className="text-xl font-semibold text-slate-900">{name}</h2>
  <p className="text-sm text-slate-600">{description}</p>
  <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
   {items.map(item=><li key={item.href}>
    <Link href={item.href} className="block h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
     <p className="text-xs font-semibold tracking-wider text-emerald-800">{item.tag}</p>
     <h3 className="mt-2 font-semibold text-slate-900">{item.title}</h3>
     <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
    </Link>
   </li>)}
  </ul>
 </section>;
}
export default function ChessDeskDirectory({isAdministrator,hasBusiness}:{
 isAdministrator:boolean;hasBusiness:boolean;
}){
 return <div className="space-y-8">
  {hasBusiness?<Group name="Employee workspaces"
   description="The destination rechecks current membership, business and client service grants."
   items={staff}/>:<p role="status" className="rounded-xl border p-5 text-sm text-slate-700">
   No active business assignment is available. Ask an administrator to review your membership.
  </p>}
  {isAdministrator&&<Group name="Owner and administrator workspaces"
   description="Restricted controls require a current administrator role, individual client grants and current consent."
   items={manager}/>}
  <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
   <h2 className="font-semibold">Release and authorization boundaries</h2>
   <p className="mt-2 text-sm leading-6 text-slate-700">
    CHESS runs inside one isolated KOBIA tenant. Navigation does not
    grant new permission or enable a provider. Payroll funding, tax e-filing,
    bank settlement, mortgage origination, insurance binding, real estate closing,
    investment trading and merchant money movement remain separate approved systems.
    Machine worker callbacks and provider execution routes have no employee controls.
   </p>
  </section>
 </div>;
}
