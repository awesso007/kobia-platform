import Link from "next/link";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {assertBusinessManager} from "@/lib/chess/business-manager";
import {isUsableConsent} from "@/lib/chess/onboarding";
import {listChessBankReviews,listChessBankReviewCandidates} from "@/lib/chess/bank-review";
import {listChessTaxWorkpapers} from "@/lib/chess/tax-workpapers";
import BankReviewClient from "./BankReviewClient";
import TaxWorkpaperClient from "./TaxWorkpaperClient";
export const dynamic="force-dynamic";

export default async function ChessFinanceCasePage({
 params,searchParams,
}:{params:{caseId:string};searchParams:{businessId?:string}}){
 const businessId=searchParams.businessId??"";
 const denied=<main className="mx-auto max-w-4xl p-8" role="alert">
  Finance case unavailable, missing current client consent, or access denied.
 </main>;
 try{
  await assertBusinessManager(businessId);
  const {db,tenantId}=getTenantDb();
  const record=await db.chessServiceCase.findFirst({where:{
   id:params.caseId,businessId,status:"ACTIVE",
   service:{in:["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX"]},
  },select:{id:true,clientProfileId:true,service:true}});
  if(!record)return denied;
  const grant=await getClientServiceLink(record.clientProfileId,businessId,record.service);
  if(!grant)return denied;
  const consents=await db.chessClientConsent.findMany({where:{
   businessId,clientProfileId:record.clientProfileId,
   purpose:`service:${record.service}`,
  },select:{status:true,expiresAt:true,consentedAt:true,
   acceptedByClerkUserId:true,verifiedEmailDigest:true,acceptanceEvidenceDigest:true}});
  if(!consents.some(x=>isUsableConsent(x)))return denied;
  const [profile,tenant]=await Promise.all([
   db.clientProfile.findUnique({where:{id:record.clientProfileId},
    select:{displayName:true}}),
   getTenantBySlug(tenantId),
  ]);
  if(!profile || !tenant)return denied;
  let content;
  if(record.service==="BOOKKEEPING"||record.service==="ACCOUNTING"){
   try{
    const ctx={businessId,clientProfileId:record.clientProfileId,
     serviceCaseId:record.id,service:record.service};
    const [candidates,reviews]=await Promise.all([
     listChessBankReviewCandidates(ctx),listChessBankReviews(ctx),
    ]);
    content=<BankReviewClient businessId={businessId}
     clientProfileId={record.clientProfileId} serviceCaseId={record.id}
     service={record.service} accounts={candidates.accounts}
     transactions={candidates.transactions.map(t=>({
      ...t,postedDate:t.postedDate.toISOString(),
     }))}
     reviews={reviews.map(r=>({...r,
      updatedAt:r.updatedAt.toISOString(),
     }))}/>;
   }catch{
    content=<p className="rounded-lg border border-amber-200 p-4 text-sm">
     No usable ledger mapping or active grant is available for bank transaction review.
    </p>;
   }
  }else if(record.service==="TAX"){
   try{
    const workpapers=await listChessTaxWorkpapers(
     businessId,record.clientProfileId,record.id);
    content=<TaxWorkpaperClient businessId={businessId}
     clientProfileId={record.clientProfileId} serviceCaseId={record.id}
     workpapers={workpapers.map(w=>({
      ...w,startAt:w.startAt.toISOString(),endAt:w.endAt.toISOString(),
      updatedAt:w.updatedAt.toISOString(),
     }))}/>;
   }catch{
    content=<p className="rounded-lg border border-amber-200 p-4 text-sm">
     An ACTIVE tax case and a current, same-tenant ledger mapping are required.
    </p>;
   }
  }else{
   const dispatches=await db.chessPayrollDispatch.findMany({where:{
    businessId,clientProfileId:record.clientProfileId,
    legacyTenantId:tenant.id,
   },select:{id:true,legacyPayRunId:true,status:true,
    submittedAt:true,providerCheckedAt:true},
    orderBy:{createdAt:"desc"},take:100});
   content=<section className="space-y-3">
    <h2 className="text-xl font-semibold">Payroll provider status</h2>
    <p className="text-sm text-slate-600">
     Read-only vendor assertions. This page never initiates a payroll run,
     wage transfer, ACH debit or tax deposit.
    </p>
    {dispatches.length===0?<p>No provider submissions are recorded.</p>:
     <ul className="space-y-2">{dispatches.map(item=><li key={item.id}
      className="rounded-lg border border-slate-200 p-3 text-sm">
      <strong>{item.status.replaceAll("_"," ")}</strong> ·
      Run {item.legacyPayRunId}
      {item.providerCheckedAt?` · Checked ${item.providerCheckedAt.toLocaleString()}`:""}
     </li>)}</ul>}
   </section>;
  }
  return <main className="mx-auto max-w-6xl space-y-7 px-6 py-10">
   <header>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
     CHESS CORP 2 · {record.service}
    </p>
    <h1 className="mt-2 text-3xl font-semibold">{profile.displayName}</h1>
    <p className="mt-1 text-sm text-slate-600">Authorized service case {record.id}</p>
   </header>
   {content}
   <Link href={`/app/finance-operations?businessId=${encodeURIComponent(businessId)}`}
    className="text-sm font-semibold text-emerald-700 hover:underline">
    Back to finance operations
   </Link>
  </main>;
 }catch{return denied;}
}
