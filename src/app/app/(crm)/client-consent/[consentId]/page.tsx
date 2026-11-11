import {auth,currentUser} from "@clerk/nextjs/server";
import {notFound} from "next/navigation";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import ConsentDecision from "./ConsentDecision";
export const dynamic="force-dynamic";

/** The policy snapshot is visible only to the authenticated, verified client
 * matching the linked CRM contact. It is never indexed or publicly listed. */
export default async function ClientConsentPage({params}:{params:{consentId:string}}) {
 const userId=auth().userId;
 const user=await currentUser();
 const email=user?.primaryEmailAddress;
 if(!userId || user?.id!==userId || email?.verification?.status!=="verified" ||
    !email.emailAddress)notFound();
 let consent: {id:string;purpose:string;policyVersion:string;policyText:string;expiresAt:Date|null;clientProfileId:string}|null=null;
 try{
  const {db}=getTenantDb();
  const found=await db.chessClientConsent.findUnique({
   where:{id:params.consentId},
   select:{id:true,purpose:true,policyVersion:true,policyText:true,
    expiresAt:true,status:true,clientProfileId:true},
  });
  if(!found || found.status!=="PENDING" || found.policyText.length<50 ||
     (found.expiresAt && found.expiresAt<=new Date()))notFound();
  const profile=await db.clientProfile.findUnique({where:{id:found.clientProfileId},
   select:{contactId:true}});
  if(!profile?.contactId)notFound();
  const contact=await db.contact.findUnique({where:{id:profile.contactId},select:{email:true}});
  if(!contact?.email || contact.email.trim().toLowerCase()!==email.emailAddress.trim().toLowerCase())notFound();
  consent=found;
 }catch{notFound();}
 if(!consent)notFound();
 return <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
  <header><p className="text-xs uppercase tracking-wide text-emerald-700">CHESS Client Consent</p>
   <h1 className="mt-2 text-3xl font-semibold">Review and approve access</h1>
   <p className="mt-2 text-sm text-slate-600">Purpose: {consent.purpose} · Policy version: {consent.policyVersion}</p>
  </header>
  <section className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-800">
   {consent.policyText}
  </section>
  <ConsentDecision consentId={consent.id} policyVersion={consent.policyVersion}/>
  <p className="text-xs text-slate-600">This records authenticated electronic consent; it is not a substitute for a regulated e-signature where one is required.</p>
 </main>;
}
