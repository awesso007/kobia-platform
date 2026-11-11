import Link from "next/link";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getOwnClientConsent} from "@/lib/chess/client-consent-self-service";
import ConsentControls from "./ConsentControls";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Review consent disclosure",robots:{index:false,follow:false}};

export default async function ConsentDetail({
 params,
}:{params:{consentId:string}}){
 const tenant=headers().get("x-tenant-id");
 if(!tenant)notFound();
 let consent:Awaited<ReturnType<typeof getOwnClientConsent>>;
 try{consent=await getOwnClientConsent(params.consentId);}
 catch{notFound();}
 return <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
  <Link className="text-sm font-semibold text-emerald-700 underline underline-offset-4"
    href={`/client-consents?tenant=${encodeURIComponent(tenant)}`}>
   Back to consent records
  </Link>
  <header className="space-y-2">
   <h1 className="text-3xl font-semibold text-slate-950">Review your disclosure</h1>
   <p className="text-sm text-slate-700">
    Purpose: {consent.purpose} · Version: {consent.policyVersion}
   </p>
   <p className="text-sm font-semibold text-slate-900">Status: {consent.status}</p>
  </header>
  <section aria-label="Full consent policy" className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-900">
   {consent.policyText}
  </section>
  <ConsentControls consentId={consent.id} policyVersion={consent.policyVersion}
   status={consent.status} tenant={tenant}/>
  <p className="text-xs leading-5 text-slate-600">
   Your verified sign-in is used to protect this disclosure. An accepted
   consent is not a regulated legal e-signature. Withdrawal prevents new
   uses requiring this consent but cannot automatically undo prior disclosure.
  </p>
 </main>;
}
