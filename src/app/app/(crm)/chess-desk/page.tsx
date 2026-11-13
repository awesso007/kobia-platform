import Link from "next/link";
import type {Metadata} from "next";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {listChessManagedBusinessUnits} from "@/lib/chess/business-manager";
import ChessDeskDirectory from "./ChessDeskDirectory";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"CHESS employee service desk",robots:{index:false,follow:false}};
export default async function ChessServiceDeskPage(){
 try{
  const actor=await getCurrentMembership();
  if(!actor||actor.status!=="ACTIVE")throw new Error("Inactive membership");
  const businesses=await listBusinessUnits();
  const managed=await listChessManagedBusinessUnits();
  return <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
   <header>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS Corporation · Employee operations
    </p>
    <h1 className="mt-2 text-3xl font-semibold">Service desk</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
     Find the CHESS workflows already implemented in KOBIA.
     Access is restricted to your current tenant, active business assignments
     and individual client-service permissions.
    </p>
    <p className="mt-2 text-xs text-slate-600">
     Visible active business units: {businesses.length}.
    </p>
   </header>
   <ChessDeskDirectory hasBusiness={businesses.length>0}
    isAdministrator={["OWNER","ADMIN"].includes(actor.role)}
    isBusinessManager={managed.length>0}
    managerBusinessId={managed[0]?.id}/>
   <Link href="/app/overview" className="text-sm font-semibold text-emerald-800 underline">
    Return to overview
   </Link>
  </main>;
 }catch{
  return <main role="alert" className="mx-auto max-w-4xl p-8">
   An active CHESS tenant membership is required to open the employee service desk.
  </main>;
 }
}
