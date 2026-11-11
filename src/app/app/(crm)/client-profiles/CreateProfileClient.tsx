"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

export default function CreateProfileClient(){
 const router=useRouter();
 const [displayName,setDisplayName]=useState("");
 const [contactId,setContactId]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/client-profiles",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({displayName:displayName.trim(),
     ...(contactId.trim()?{contactId:contactId.trim()}:{}),
    }),
   });
   if(!response.ok)throw new Error(response.status===403?
    "You do not have permission to create a profile.":
    response.status===400?"Enter a valid client label and optional existing contact ID.":
    "Unable to create client profile.");
   const data=await response.json();
   if(typeof data?.profile?.id!=="string")throw new Error("Profile response was incomplete.");
   router.push(`/app/client-profiles/${encodeURIComponent(data.profile.id)}`);
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:"Unable to save.");}
  finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-lg font-semibold text-slate-900">New client profile</h2>
  <p className="text-sm text-slate-600">Create basic CRM identity only.
   Financial, tax, mortgage and other service records are not shared automatically.</p>
  <div className="flex flex-wrap items-end gap-3">
   <label className="min-w-[220px] flex-1 text-sm font-semibold">Client display name
    <input required maxLength={200} value={displayName}
     onChange={e=>setDisplayName(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/></label>
   <label className="min-w-[220px] flex-1 text-sm font-semibold">Existing CRM contact ID (optional)
    <input maxLength={128} value={contactId}
     onChange={e=>setContactId(e.target.value)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/></label>
   <button disabled={busy||!displayName.trim()}
    className="rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">
    {busy?"Creating...":"Create profile"}
   </button>
  </div>
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </form>;
}
