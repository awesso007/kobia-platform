import Link from "next/link";
import {listBusinessUnits} from "@/lib/chess/business-units";
export const dynamic="force-dynamic";

export default async function ChessBusinessUnitsPage() {
 let units: Awaited<ReturnType<typeof listBusinessUnits>>=[];
 let denied=false;
 try {units=await listBusinessUnits();} catch {denied=true;}
 return <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
  <header>
   <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">CHESS CORP 2</p>
   <h1 className="mt-1 text-3xl font-semibold text-slate-950">Business units</h1>
   <p className="mt-2 text-slate-600">Your assigned business workspaces. Data permissions are checked by the server.</p>
  </header>
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
  <Link className="text-sm font-medium text-emerald-700 hover:underline" href="/app/overview">Return to overview</Link>
 </main>;
}
