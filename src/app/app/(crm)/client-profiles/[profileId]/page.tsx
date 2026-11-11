import Link from "next/link";
import {notFound} from "next/navigation";
import {getClientProvisioning} from "@/lib/client-profile/service";
import ProvisioningClient from "./ProvisioningClient";

export const dynamic="force-dynamic";

export default async function ClientProfileDetails({params}:{params:{profileId:string}}){
 let data:Awaited<ReturnType<typeof getClientProvisioning>>;
 try{data=await getClientProvisioning(params.profileId);}catch{notFound();}
 const memberships=data.members.map(m=>({
  clerkUserId:m.clerkUserId,displayName:m.displayName,role:m.role,
 }));
 const links=data.links.map(link=>({
  id:link.id,businessId:link.businessId,service:link.service,
  grants:link.grants.map(g=>({
   ...g,revokedAt:g.revokedAt?.toISOString()??null,
  })),
 }));
 const consents=data.consents.map(c=>({
  id:c.id,businessId:c.businessId,purpose:c.purpose,
  policyVersion:c.policyVersion,status:c.status,
  createdAt:c.createdAt.toISOString(),
  expiresAt:c.expiresAt?.toISOString()??null,
  consentedAt:c.consentedAt?.toISOString()??null,
  withdrawnAt:c.withdrawnAt?.toISOString()??null,
 }));
 return <main className="mx-auto max-w-6xl space-y-7 px-6 py-10">
  <Link href="/app/client-profiles"
   className="text-sm font-semibold text-emerald-800 hover:underline">
   Back to client directory
  </Link>
  <header className="space-y-2">
   <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
    CHESS CORP 2 · Authorized administration
   </p>
   <h1 className="text-3xl font-semibold text-slate-950">{data.profile.displayName}</h1>
   <p className="text-sm text-slate-600">Service provisioning, individual employee grants
    and purpose-bound consent requests. These administrative controls do not
    themselves grant service access, and permission is checked at every API call.</p>
  </header>
  <ProvisioningClient profileId={data.profile.id} businesses={data.businesses}
   members={memberships} links={links} consents={consents}/>
 </main>;
}
