"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

type Business={id:string;name:string;slug:string};
type Member={clerkUserId:string;displayName:string|null;role:string};
type Grant={id:string;clerkUserId:string;canRead:boolean;canWrite:boolean;revokedAt:string|null};
type LinkRow={id:string;businessId:string;service:string;grants:Grant[]};
type Consent={id:string;businessId:string;purpose:string;policyVersion:string;
 status:string;createdAt:string;expiresAt:string|null;consentedAt:string|null;
 withdrawnAt:string|null};
const services=["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX",
 "MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"] as const;
const purposes=["service","billing","external_handoff","bank_feed"] as const;

export default function ProvisioningClient({profileId,businesses,members,links,consents}:{
 profileId:string;businesses:Business[];members:Member[];links:LinkRow[];consents:Consent[];
}){
 const router=useRouter();
 const [businessId,setBusinessId]=useState(businesses[0]?.id??"");
 const [service,setService]=useState<string>("BOOKKEEPING");
 const [linkId,setLinkId]=useState(links[0]?.id??"");
 const [memberId,setMemberId]=useState("");
 const [write,setWrite]=useState(false);
 const [purpose,setPurpose]=useState<(typeof purposes)[number]>("service");
 const [version,setVersion]=useState("");
 const [policy,setPolicy]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [newLink,setNewLink]=useState("");
 async function mutate(method:"POST"|"PUT"|"DELETE",url:string,body:object,
  success:string):Promise<unknown|null>{
  if(busy)return null;
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch(url,{
    method,credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),
   });
   if(!response.ok)throw new Error(response.status===403?
    "Permission denied. Check current business, staff and service grants.":
    response.status===400?"Invalid input. Review the required fields.":
    "This request was not completed.");
   const result=await response.json();
   setMessage(success);router.refresh();
   return result;
  }catch(err){setError(err instanceof Error?err.message:"Request failed.");return null;}
  finally{setBusy(false);}
 }
 function selectedLink(){return links.find(l=>l.id===linkId);}
 const visibleGrants=selectedLink()?.grants.filter(g=>!g.revokedAt)??[];
 const selectedBusiness=(id:string)=>businesses.find(b=>b.id===id)?.name??"Unknown business";
 return <div className="space-y-6">
  <section className="rounded-xl border border-slate-200 bg-white p-5">
   <h2 className="text-xl font-semibold">1. Provision a business service</h2>
   <p className="mt-1 text-sm text-slate-600">Creating a service link does not
    automatically give staff access to regulated records.</p>
   <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async e=>{
    e.preventDefault();if(!businessId)return;
    const data=await mutate("POST",
     `/api/client-profiles/${encodeURIComponent(profileId)}/services`,
     {businessId,service},"Service link created or found. Assign a staff grant separately.");
    const id=(data as {link?:{id?:string}}|null)?.link?.id;
    if(typeof id==="string"){setNewLink(id);setLinkId(id);}
   }}>
    <label className="min-w-[210px] flex-1 text-sm font-semibold">Business
     <select required value={businessId} onChange={e=>setBusinessId(e.target.value)}
      className="mt-1 block w-full rounded-md border p-2">
      {businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
     </select>
    </label>
    <label className="min-w-[170px] flex-1 text-sm font-semibold">Service
     <select value={service} onChange={e=>setService(e.target.value)}
      className="mt-1 block w-full rounded-md border p-2">
      {services.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
     </select>
    </label>
    <button disabled={busy||!businessId}
     className="rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
     Create service link
    </button>
   </form>
   {newLink&&<p className="mt-2 text-xs text-emerald-900">
    Link request succeeded. Refresh to view its grants.
   </p>}
  </section>
  <section className="rounded-xl border border-slate-200 bg-white p-5">
   <h2 className="text-xl font-semibold">2. Employee service grants</h2>
   <p className="mt-1 text-sm text-slate-600">Grant read or read/write only to
    an active authorized employee. Revoke access when their need ends.</p>
   {links.length===0?<p className="mt-3 text-sm text-slate-600">
    No existing service links. Create a link first.
   </p>:<>
    <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e=>{
     e.preventDefault();
     if(!linkId||!memberId)return;
     void mutate("PUT",`/api/client-service-links/${encodeURIComponent(linkId)}/grants`,
      {clerkUserId:memberId,canRead:true,canWrite:write},"Service grant updated.");
    }}>
     <label className="min-w-[220px] flex-1 text-sm font-semibold">Service link
      <select value={linkId} onChange={e=>setLinkId(e.target.value)}
       className="mt-1 block w-full rounded-md border p-2">
       {links.map(l=><option key={l.id} value={l.id}>
        {selectedBusiness(l.businessId)} · {l.service.replaceAll("_"," ")}
       </option>)}
      </select>
     </label>
     <label className="min-w-[220px] flex-1 text-sm font-semibold">Employee
      <select required value={memberId} onChange={e=>setMemberId(e.target.value)}
       className="mt-1 block w-full rounded-md border p-2">
       <option value="">Select active employee</option>
       {members.map(m=><option key={m.clerkUserId} value={m.clerkUserId}>
        {m.displayName||m.clerkUserId} ({m.role})
       </option>)}
      </select>
     </label>
     <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={write} onChange={e=>setWrite(e.target.checked)}/>
      Allow writes
     </label>
     <button disabled={busy||!memberId}
      className="rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
      Grant access
     </button>
    </form>
    <h3 className="mt-5 font-semibold">Active grants for selected service</h3>
    {visibleGrants.length===0?<p className="text-sm text-slate-600">No active grants.</p>:
     <ul className="mt-2 divide-y">
      {visibleGrants.map(g=><li key={g.id}
       className="flex flex-wrap items-center justify-between gap-3 py-3">
       <div className="text-sm">
        <strong>{members.find(m=>m.clerkUserId===g.clerkUserId)?.displayName||g.clerkUserId}</strong>
        <p className="text-xs text-slate-600">{g.canWrite?"Read and write":g.canRead?"Read only":"No active capability"}</p>
       </div>
       <button type="button" disabled={busy} onClick={()=>void mutate(
        "DELETE",`/api/client-service-links/${encodeURIComponent(linkId)}/grants`,
        {clerkUserId:g.clerkUserId},"Employee service access revoked.")}
        className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-40">
        Revoke access
       </button>
      </li>)}
     </ul>}
   </>}
  </section>
  <section className="rounded-xl border border-slate-200 bg-white p-5">
   <h2 className="text-xl font-semibold">3. Request purpose-specific client consent</h2>
   <p className="mt-1 text-sm text-slate-600">Only issue independently reviewed
    disclosure text. A PENDING record does not permit sharing; the verified
    client must accept through their own approved identity flow.</p>
   <form className="mt-3 grid gap-3" onSubmit={async e=>{
    e.preventDefault();
    if(policy.trim().length<50||!businessId)return;
    const result=await mutate("POST","/api/chess/consents",{
     businessId,clientProfileId:profileId,
     purpose:`${purpose}:${service}`,policyVersion:version.trim(),
     policyText:policy.trim(),
    },"Pending client disclosure created. Client must independently accept.");
    if(result)setPolicy("");
   }}>
    <div className="flex flex-wrap gap-3">
     <label className="min-w-[180px] flex-1 text-sm font-semibold">Business
      <select value={businessId} onChange={e=>setBusinessId(e.target.value)}
       className="mt-1 block w-full rounded-md border p-2">
       {businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
     </label>
     <label className="min-w-[160px] flex-1 text-sm font-semibold">Purpose
      <select value={purpose} onChange={e=>setPurpose(e.target.value as typeof purpose)}
       className="mt-1 block w-full rounded-md border p-2">
       {purposes.map(p=><option key={p} value={p}>{p.replaceAll("_"," ")}</option>)}
      </select>
     </label>
     <label className="min-w-[160px] flex-1 text-sm font-semibold">Service
      <select value={service} onChange={e=>setService(e.target.value)}
       className="mt-1 block w-full rounded-md border p-2">
       {services.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}
      </select>
     </label>
     <label className="min-w-[130px] flex-1 text-sm font-semibold">Policy version
      <input required maxLength={60} value={version}
       onChange={e=>setVersion(e.target.value)}
       className="mt-1 block w-full rounded-md border p-2"/>
     </label>
    </div>
    <label className="text-sm font-semibold">Exact approved policy text
     <textarea required minLength={50} maxLength={20000}
      value={policy} onChange={e=>setPolicy(e.target.value)}
      rows={6} className="mt-1 block w-full rounded-md border p-2"
      placeholder="Paste the exact independently approved disclosure here."/>
    </label>
    <button disabled={busy||!businessId||!version.trim()||policy.trim().length<50}
     className="w-fit rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40">
     Create pending disclosure
    </button>
   </form>
   <h3 className="mt-5 font-semibold">Recent consent statuses</h3>
   {consents.length===0?<p className="text-sm text-slate-600">No consent requests yet.</p>:
    <ul className="mt-3 space-y-2">
     {consents.map(c=><li key={c.id} className="rounded-lg border p-3 text-sm">
      <strong>{selectedBusiness(c.businessId)} · {c.purpose}</strong>
      <p className="text-xs text-slate-600">Version {c.policyVersion} ·
       Status: {c.status} · Requested {c.createdAt.slice(0,10)}</p>
     </li>)}
    </ul>}
  </section>
  {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </div>;
}
