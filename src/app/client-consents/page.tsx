import Link from "next/link";
import {headers} from "next/headers";
import type {Metadata} from "next";
import {currentClientConsentPortalActive} from "@/lib/chess/client-consent-portal-policy";
import {notFound} from "next/navigation";
import {listOwnClientConsents} from "@/lib/chess/client-consent-self-service";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Your consent records",robots:{index:false,follow:false}};

export default async function ClientConsentDashboard(){
 if(!currentClientConsentPortalActive())notFound();
 const tenant=headers().get("x-tenant-id");
 let records:Awaited<ReturnType<typeof listOwnClientConsents>>=[];
 let error=false;
 try{
  if(!tenant)throw new Error("No selected tenant.");
  records=await listOwnClientConsents();
 }catch{error=true;}
 return <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
  <header className="space-y-2">
   <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">CHESS Client Portal</p>
   <h1 className="text-3xl font-semibold text-slate-950">Your consent records</h1>
   <p className="text-sm text-slate-700">
    Review each disclosure and withdraw previously accepted permission.
    Only records matched to your verified sign-in email are displayed.
   </p>
  </header>
  {error?<section role="alert" className="rounded-lg border border-red-200 p-5 text-red-800">
   Unable to access the consent portal. Use your authorized tenant link and
   verified client email, or contact your service representative.
  </section>:records.length===0?
   <p className="rounded-lg border border-slate-200 p-5 text-slate-700">
    No consent records are currently available for this account.
   </p>:<ul className="space-y-3">
    {records.map(record=><li key={record.id}
     className="rounded-lg border border-slate-200 bg-white p-5">
     <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className="font-semibold text-slate-900">{record.purpose}</p>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800">
       {record.status}
      </span>
     </div>
     <p className="mt-1 text-xs text-slate-600">
      Policy {record.policyVersion} · Issued {record.createdAt.toISOString().slice(0,10)}
     </p>
     <Link className="mt-3 inline-block rounded-md text-sm font-semibold text-emerald-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2"
      href={`/client-consents/${encodeURIComponent(record.id)}?tenant=${encodeURIComponent(tenant!)}`}>
      Review disclosure and options
     </Link>
    </li>)}
   </ul>}
  <p className="text-xs leading-5 text-slate-600">This portal records authenticated consent and withdrawal.
   It is not a substitute for a regulated e-signature where one is required.
   Withdrawal may not reverse information already lawfully shared.
  </p>
 </main>;
}
