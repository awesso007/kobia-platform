import Link from "next/link";

import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {listChessAuthorizedRegulatedCases} from "@/lib/chess/regulated-case-directory";
import {selectChessWorkspace} from "@/lib/chess/workspace-selection";


import {listChessRegulatedAffiliations} from "@/lib/chess/regulated-affiliations";
import AffiliationClient from "./AffiliationClient";
import {listChessLicensesForReview} from "@/lib/chess/license-registry";
import LicenseReviewClient from "./LicenseReviewClient";
export const dynamic="force-dynamic";

export default async function ChessRegulatedServicesPage({
 searchParams,
}:{searchParams:{businessId?:string}}){
 const member=await getCurrentMembership();
 if(!member||member.status!=="ACTIVE")return <main role="alert"
  className="mx-auto max-w-5xl p-8">Active workspace membership required.</main>;
 let units:Awaited<ReturnType<typeof listBusinessUnits>>=[];
 try{units=await listBusinessUnits();}catch{
  return <main role="alert" className="mx-auto max-w-5xl p-8">
   Regulated business workspaces are unavailable.</main>;
 }
 const workspace=selectChessWorkspace(units,searchParams.businessId);
 if(workspace.status!=="READY")return <main role="status" className="mx-auto max-w-5xl space-y-3 p-8">
  <h1 className="text-2xl font-semibold">Regulated service workspace unavailable</h1>
  <p className="text-sm text-slate-700">
   {workspace.status==="UNAVAILABLE"?
    "The requested business is no longer assigned to you. No other business was selected.":
    "No active regulated-service business unit is assigned to your account."}
  </p>
  <Link href="/app/chess-desk" className="text-sm font-semibold text-emerald-800 underline">
   Return to service desk
  </Link>
 </main>;
 const chosen=workspace.selected;

 const authorized=await listChessAuthorizedRegulatedCases(chosen.id);
 let licenseQueue:Awaited<ReturnType<typeof listChessLicensesForReview>>|null=null;
 let affiliations:Awaited<ReturnType<typeof listChessRegulatedAffiliations>>=[];
 if(["OWNER","ADMIN"].includes(member.role)){
  try{
   [affiliations,licenseQueue]=await Promise.all([
    listChessRegulatedAffiliations(chosen.id),
    listChessLicensesForReview(chosen.id),
   ]);
  }catch{/* No fallback to tenant-wide professional data. */}
 }
 return <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
  <header>
   <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
    CHESS CORP 2 · Milestone 6
   </p>
   <h1 className="mt-2 text-3xl font-semibold text-slate-950">
    Regulated service operations
   </h1>
   <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
    Coordinate mortgage, insurance, real estate and investment-service
    intake. This workspace does not originate loans, issue policies,
    execute brokerage agreements, provide investment advice or place trades.
   </p>
  </header>
  <nav aria-label="Choose business unit" className="flex flex-wrap gap-2">
   {units.map(unit=><Link key={unit.id}
    href={`/app/regulated-services?businessId=${encodeURIComponent(unit.id)}`}
    className={`rounded-lg border px-3 py-2 text-sm
     ${unit.id===chosen.id?"bg-emerald-900 text-white":"border-slate-200"}`}>
    {unit.name}
   </Link>)}
  </nav>
  <section className="space-y-3">
   <h2 className="text-xl font-semibold">Authorized client cases</h2>
   {authorized.length===0?<p className="text-sm text-slate-600">
    No active cases with explicit service grants and accepted client consent.
   </p>:<ul className="grid gap-3 sm:grid-cols-2">
    {authorized.map(item=><li key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
     <strong>{item.service.replaceAll("_"," ")}</strong>
     <p className="mt-2 text-xs text-slate-600">Case reference {item.id}</p>
     <Link className="mt-3 inline-block text-sm font-semibold text-emerald-800"
      href={`/app/regulated-services/${encodeURIComponent(item.id)}?businessId=${encodeURIComponent(chosen.id)}`}>
      Open intake and compliance workflow
     </Link>
    </li>)}</ul>}
  </section>
  {licenseQueue&&<LicenseReviewClient businessId={chosen.id}
   viewerId={licenseQueue.viewerId}
   registryConfigured={licenseQueue.registryConfigured}
   credentials={licenseQueue.records.map(c=>({
    ...c,verifiedAt:c.verifiedAt?.toISOString()??null,
    registryCheckedAt:c.registryCheckedAt?.toISOString()??null,
    expiresAt:c.expiresAt?.toISOString()??null,
   }))}/>}
  {["OWNER","ADMIN"].includes(member.role)&&<AffiliationClient
   businessId={chosen.id} affiliations={affiliations.map(item=>({
    ...item,checkedAt:item.checkedAt?.toISOString()??null,
    expiresAt:item.expiresAt?.toISOString()??null,
   }))}/>}
  <p className="rounded-xl border border-amber-200 p-4 text-sm text-slate-700">
   Firm associations and licenses must be checked through official,
   independently approved sources. A form entry never grants a license.
   External coordination remains disabled until provider credentials and
   the required client and compliance approvals are configured.
  </p>
 </main>;
}
