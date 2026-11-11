"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

type Member={clerkUserId:string;displayName:string|null;role:string};
type Assignment={id:string;clerkUserId:string;role:string;assignedAt:string};
type Directory={members:Member[];assignments:Assignment[]};
const roles=["MANAGER","PRACTITIONER","SUPPORT"] as const;
type Role=(typeof roles)[number];

export default function BusinessUnitAdmin({selectedBusiness,directory}:{
 selectedBusiness:{id:string;name:string}|null;directory:Directory|null;
}){
 const router=useRouter();
 const [slug,setSlug]=useState("");
 const [name,setName]=useState("");
 const [legalName,setLegalName]=useState("");
 const [staffId,setStaffId]=useState("");
 const [role,setRole]=useState<Role>("SUPPORT");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function request(method:"POST"|"DELETE",url:string,body:object,success:string){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(url,{method,credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   if(!response.ok)throw new Error(response.status===403?
    "Your account is not authorized for this action.":
    response.status===400?"Review the input values and try again.":
    "Unable to save this change. No access was granted.");
   setNotice(success);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to complete the request.");}
  finally{setBusy(false);}
 }
 const members=directory?.members??[];
 const assignments=directory?.assignments??[];
 const assignedIds=new Set(assignments.map(a=>a.clerkUserId));
 return <div className="space-y-5">
  <form className="rounded-xl border border-slate-200 bg-white p-5"
   onSubmit={async e=>{
    e.preventDefault();
    await request("POST","/api/chess/business-units",
      {...(legalName.trim()?{legalName:legalName.trim()}:{}),
       slug:slug.trim(),name:name.trim()},"Business unit request completed.");
   }}>
   <h3 className="font-semibold text-slate-900">Create a business unit</h3>
   <p className="mb-3 text-xs text-slate-600">A workspace does not establish a separate legal entity or license.</p>
   <div className="grid gap-3 sm:grid-cols-3">
    <label className="text-sm font-medium text-slate-800">Identifier
     <input required maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*"
      value={slug} onChange={e=>setSlug(e.target.value)}
      placeholder="chess-accounting" className="mt-1 w-full rounded-md border p-2"/></label>
    <label className="text-sm font-medium text-slate-800">Business label
     <input required minLength={2} maxLength={150}
      value={name} onChange={e=>setName(e.target.value)}
      className="mt-1 w-full rounded-md border p-2"/></label>
    <label className="text-sm font-medium text-slate-800">Legal name (optional)
     <input minLength={2} maxLength={250}
      value={legalName} onChange={e=>setLegalName(e.target.value)}
      className="mt-1 w-full rounded-md border p-2"/></label>
   </div>
   <button disabled={busy} className="mt-3 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
    Create workspace</button>
  </form>
  {selectedBusiness&&<section className="rounded-xl border border-slate-200 bg-white p-5">
   <h3 className="font-semibold text-slate-900">Staff for {selectedBusiness.name}</h3>
   {!directory?<p role="alert" className="mt-2 text-sm text-red-800">
    Staff administration is unavailable; no permissions can be changed.
   </p>:<>
    <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={e=>{
     e.preventDefault();
     if(!staffId)return;
     void request("POST","/api/chess/employee-assignments",
      {businessId:selectedBusiness.id,clerkUserId:staffId,role},
      "Employee assignment updated.");
    }}>
     <label className="min-w-[180px] flex-1 text-sm font-medium">Active employee
      <select required value={staffId} onChange={e=>setStaffId(e.target.value)}
       className="mt-1 w-full rounded-md border p-2">
       <option value="">Select employee</option>
       {members.map(m=><option key={m.clerkUserId} value={m.clerkUserId}>
        {m.displayName||m.clerkUserId} ({m.role}){assignedIds.has(m.clerkUserId)?" · assigned":""}
       </option>)}
      </select>
     </label>
     <label className="text-sm font-medium">Unit role
      <select value={role} onChange={e=>setRole(e.target.value as Role)}
       className="mt-1 w-full rounded-md border p-2">
       {roles.map(r=><option key={r} value={r}>{r}</option>)}
      </select>
     </label>
     <button type="submit" disabled={!staffId||busy}
      className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
      Assign or update</button>
    </form>
    <h4 className="mt-5 font-semibold">Active assignments</h4>
    {assignments.length===0?<p className="text-sm text-slate-600">No active staff assignments.</p>:
    <ul className="mt-2 divide-y">
     {assignments.map(a=>{
      const m=members.find(x=>x.clerkUserId===a.clerkUserId);
      return <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
       <div><strong>{m?.displayName||a.clerkUserId}</strong>
        <p className="text-xs text-slate-600">{a.role} · Assigned {a.assignedAt.slice(0,10)}</p></div>
       <button type="button" disabled={busy}
        onClick={()=>void request("DELETE","/api/chess/employee-assignments",
         {businessId:selectedBusiness.id,clerkUserId:a.clerkUserId},
         "Employee access revoked.")}
        className="rounded border border-red-300 px-3 py-2 font-semibold text-red-800 disabled:opacity-40">
        Revoke unit access</button>
      </li>;
     })}
    </ul>}
   </>}
  </section>}
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </div>;
}
