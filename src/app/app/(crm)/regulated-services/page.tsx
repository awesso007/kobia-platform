import Link from "next/link";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {isUsableConsent} from "@/lib/chess/onboarding";
import {listChessRegulatedAffiliations} from "@/lib/chess/regulated-affiliations";
import AffiliationClient from "./AffiliationClient";
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
 const chosen=units.find(u=>u.id===searchParams.businessId)??units[0];
 if(!chosen)return <main className="mx-auto max-w-5xl p-8">
  No assigned regulated business unit.</main>;
 const {db}=getTenantDb();
 const rawCases=await db.chessServiceCase.findMany({where:{
  businessId:chosen.id,service:{in:[
   "MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS",
  ]},status:"ACTIVE",
 },select:{id:true,clientProfileId:true,service:true,ownerClerkUserId:true},
  orderBy:{createdAt:"desc"},take:100});
 const authorized:typeof rawCases=[];
 for(const item of rawCases){
  try{
   const grant=await getClientServiceLink(item.clientProfileId,chosen.id,item.service);
   if(!grant)continue;
   const consents=await db.chessClientConsent.findMany({where:{
    businessId:chosen.id,clientProfileId:item.clientProfileId,
    purpose:`service:${item.service}`,
   },select:{status:true,expiresAt:true,consentedAt:true,acceptedByClerkUserId:true,
    verifiedEmailDigest:true,acceptanceEvidenceDigest:true}});
   if(consents.some(x=>isUsableConsent(x)))authorized.push(item);
  }catch{/* A service without an explicit grant must not appear. */}
 }
 let affiliations:Awaited<ReturnType<typeof listChessRegulatedAffiliations>>=[];
 if(["OWNER","ADMIN"].includes(member.role)){
  try{affiliations=await listChessRegulatedAffiliations(chosen.id);}
  catch{/* No fallback to tenant-wide employee data. */}
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
