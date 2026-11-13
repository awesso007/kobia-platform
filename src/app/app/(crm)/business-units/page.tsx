import Link from "next/link";
import {listBusinessUnits,getChessBusinessAssignmentAdmin} from "@/lib/chess/business-units";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {selectChessWorkspace} from "@/lib/chess/workspace-selection";
import BusinessUnitAdmin from "./BusinessUnitAdmin";
export const dynamic="force-dynamic";

export default async function ChessBusinessUnitsPage({searchParams}:{searchParams:{businessId?:string}}) {
 let units: Awaited<ReturnType<typeof listBusinessUnits>>=[];
 let denied=false;
 try {units=await listBusinessUnits();} catch {denied=true;}
 const actor=await getCurrentMembership().catch(()=>null);
 const canManage=actor?.status==="ACTIVE"&&["OWNER","ADMIN"].includes(actor.role);
 const workspace=selectChessWorkspace(units,searchParams.businessId);
 const selected=workspace.status==="READY"?workspace.selected:null;
 const admin=canManage&&selected
  ?await getChessBusinessAssignmentAdmin(selected.id).catch(()=>null)
  :null;
 return <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
  <header>
   <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">CHESS CORP 2</p>
   <h1 className="mt-1 text-3xl font-semibold text-slate-950">Business units</h1>
   <p className="mt-2 text-slate-600">Your assigned business workspaces. Data permissions are checked by the server.</p>
  </header>
  {workspace.status==="UNAVAILABLE"&&!denied&&<p role="alert"
   className="space-y-2 rounded-xl border border-amber-200 p-5 text-sm text-slate-800">
   The requested business is no longer available to your account. No other unit was selected
   automatically. <Link href="/app/business-units" className="font-semibold text-emerald-800 underline">
    Choose an authorized business
   </Link>
  </p>}
  {denied?<p role="alert" className="rounded-xl border border-red-200 p-6 text-red-800">
   Business units are unavailable or you do not have access.
  </p>:units.length===0?<p className="rounded-xl border border-slate-200 p-6">
   No active business units are assigned to your account.
  </p>:<ul className="grid gap-4 sm:grid-cols-2">
   {units.map(unit=><li key={unit.id} className="rounded-xl border border-slate-200 bg-white p-6">
    <h2 className="text-lg font-semibold">{unit.name}</h2>
    <p className="mt-2 text-sm text-slate-600">Workspace: {unit.slug}</p>
    <span className="mt-3 inline-block text-xs font-semibold uppercase text-emerald-700">{unit.status}</span>
   </li>)}
  </ul>}
  {canManage&&<section className="space-y-3">
    <h2 className="text-xl font-semibold text-slate-950">Manage business units and staff</h2>
    <p className="text-sm text-slate-600">
      Only tenant owners and admins can provision workspace access. Service-level
      client records require separate explicit grants.
    </p>
    <nav aria-label="Manage a business" className="flex flex-wrap gap-2">
      {units.map(unit=><Link key={unit.id}
        href={`/app/business-units?businessId=${encodeURIComponent(unit.id)}`}
        className={`rounded-lg border px-3 py-2 text-sm font-medium ${unit.id===selected?.id?"bg-emerald-800 text-white":"border-slate-300 text-slate-800"}`}>
        {unit.name}
      </Link>)}
    </nav>
    <BusinessUnitAdmin key={selected?.id??"new-business"} selectedBusiness={selected?{id:selected.id,name:selected.name}:null}
      directory={admin?{
        members:admin.members,assignments:admin.assignments.map(a=>({
          ...a,assignedAt:a.assignedAt.toISOString(),
        })),
      }:null}/>
  </section>}
  <Link className="text-sm font-medium text-emerald-700 hover:underline" href="/app/overview">Return to overview</Link>
 </main>;
}
