"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
type DocumentStatus="PENDING"|"QUARANTINED"|"READY"|"REJECTED";
type Row={id:string;fileName:string;mimeType:string;status:DocumentStatus;
 actualBytes:number|null;createdAt:string;verifiedAt:string|null;
 retentionUntil:string|null;legalHoldAt:string|null;suppressedAt:string|null};
type Service="ACCOUNTING"|"BOOKKEEPING"|"PAYROLL"|"TAX"|
 "MORTGAGE"|"INSURANCE"|"REAL_ESTATE"|"INVESTMENTS";
const maxBytes=20*1024*1024;
const allowedTypes=new Set(["application/pdf","image/png","image/jpeg"]);

export default function ServiceDocumentPanel({businessId,clientProfileId,service,
 canUpload,canManageLifecycle,documents}:{
 businessId:string;clientProfileId:string;service:Service;
 canUpload:boolean;canManageLifecycle:boolean;documents:Row[];
}){
 const router=useRouter();
 const [selected,setSelected]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [loadingId,setLoadingId]=useState("");
 const [lifecycleBusy,setLifecycleBusy]=useState("");
 const [retentionDates,setRetentionDates]=useState<Record<string,string>>({});
 async function lifecycle(documentId:string,action:"LEGAL_HOLD"|"SUPPRESS"|"SET_RETENTION"){
  if(!canManageLifecycle||lifecycleBusy)return;
  if(action!=="SET_RETENTION"&&!window.confirm(
   action==="LEGAL_HOLD"?
    "Permanently place this file metadata under legal hold? No release workflow is enabled.":
    "Permanently suppress future downloads of this document? Existing signed URLs may remain valid briefly."
  ))return;
  const retainUntil=retentionDates[documentId];
  if(action==="SET_RETENTION"&&!retainUntil)return;
  setError("");setMessage("");setLifecycleBusy(documentId);
  try{
   const response=await fetch("/api/chess/document-lifecycle",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({documentId,businessId,clientProfileId,service,action,
     ...(action==="SET_RETENTION"?{retainUntil:new Date(
      `${retainUntil}T23:59:59.000Z`).toISOString()}:{}),
    }),
   });
   if(!response.ok)throw new Error(response.status===403?
    "Lifecycle policy approval, independent service grant, or document state is missing.":
    "Unable to record the document lifecycle decision.");
   setMessage("Document lifecycle action recorded and audited. Original object has not been deleted.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to save lifecycle change.");}
  finally{setLifecycleBusy("");}
 }

 async function upload(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!selected||!canUpload||busy)return;
  setError("");setMessage("");
  if(selected.size<1||selected.size>maxBytes||!allowedTypes.has(selected.type)){
   setError("Choose a PDF, PNG or JPEG no larger than 20 MB.");
   return;
  }
  setBusy(true);
  try{
   const res=await fetch("/api/chess/documents",{
    method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({businessId,clientProfileId,service,
     fileName:selected.name,mimeType:selected.type,size:selected.size}),
   });
   if(!res.ok)throw new Error(res.status===403?
    "You do not have a current write grant for this service.":
    "Unable to start the private document upload. Check the storage configuration.");
   const body=await res.json();
   if(typeof body?.uploadUrl!=="string"||typeof body?.documentId!=="string")
    throw new Error("The private storage provider did not return a usable upload grant.");
   const signed=new URL(body.uploadUrl);
   if(signed.protocol!=="https:"&&
    !(window.location.hostname==="localhost"&&signed.protocol==="http:"))
    throw new Error("The upload destination must use an approved encrypted connection.");
   const put=await fetch(signed.toString(),{
    method:"PUT",headers:{"Content-Type":selected.type},body:selected,
   });
   if(!put.ok)throw new Error("Storage rejected the upload. Verify the private bucket CORS and permissions.");
   const confirm=await fetch("/api/chess/documents",{
    method:"PATCH",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({documentId:body.documentId,businessId,
     clientProfileId,service}),
   });
   if(!confirm.ok)throw new Error("Upload completed, but secure verification failed. Contact an administrator.");
   const status=await confirm.json();
   setSelected(null);
   setMessage(status?.status==="QUARANTINED"?
    "Upload received. This document remains quarantined until the independent malware scan declares it safe.":
    "Storage verification did not approve this document. No download is permitted.");
   router.refresh();
  }catch(err){setError(err instanceof Error?err.message:"Upload not confirmed.");}
  finally{setBusy(false);}
 }
 async function download(documentId:string){
  if(loadingId)return;
  setError("");setLoadingId(documentId);
  try{
   const q=new URLSearchParams({documentId,businessId,clientProfileId,service});
   const res=await fetch(`/api/chess/documents?${q.toString()}`,{
    credentials:"same-origin",cache:"no-store",
   });
   if(!res.ok)throw new Error("Document unavailable: current access, scan and stored version are checked again.");
   const result=await res.json();
   if(typeof result?.url!=="string")throw new Error("No private download URL returned.");
   const u=new URL(result.url);
   if(u.protocol!=="https:"&&
    !(window.location.hostname==="localhost"&&u.protocol==="http:"))
    throw new Error("The private download destination is not approved.");
   const link=document.createElement("a");
   link.href=u.toString();link.target="_blank";link.rel="noopener noreferrer";
   link.click();
  }catch(e){setError(e instanceof Error?e.message:"Document download failed.");}
  finally{setLoadingId("");}
 }
 return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
  <h2 className="text-xl font-semibold text-slate-950">Private service documents</h2>
  <p className="text-sm text-slate-600">
   Only documents for this authorized business, client and service are shown.
   New uploads stay quarantined until independently scanned. Links are short-lived.
  </p>
  {canUpload&&<form className="flex flex-wrap items-end gap-3" onSubmit={upload}>
   <label className="min-w-[240px] flex-1 text-sm font-semibold">
    Secure document (PDF, PNG, JPEG; 20 MB max)
    <input required type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
     onChange={e=>setSelected(e.target.files?.[0]??null)}
     className="mt-1 block w-full rounded-md border border-slate-300 p-2"/>
   </label>
   <button disabled={busy||!selected} type="submit"
    className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
    {busy?"Uploading...":"Upload for malware review"}</button>
  </form>}
  {documents.length===0?<p className="text-sm text-slate-600">
   No service documents have been registered.</p>:<ul className="divide-y">
   {documents.map(d=><li key={d.id}
    className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
    <div>
     <p className="font-semibold text-slate-900">{d.fileName}</p>
     <p className="text-xs text-slate-600">
      {d.status} · Added {d.createdAt.slice(0,10)}
      {d.actualBytes!==null?` · ${Math.ceil(d.actualBytes/1024).toLocaleString()} KB`:""}
      {d.suppressedAt?" · Access suppressed":""}
      {d.legalHoldAt?" · Legal hold":""}
      {d.retentionUntil?` · Retain until ${d.retentionUntil.slice(0,10)}`:""}
     </p>
    </div>
    {d.status==="READY"&&!d.suppressedAt&&
     (!d.retentionUntil||Date.parse(d.retentionUntil)>Date.now())&&<button type="button"
     disabled={!!loadingId} onClick={()=>void download(d.id)}
     className="rounded-md border border-emerald-700 px-3 py-2 font-semibold text-emerald-800 disabled:opacity-40">
     {loadingId===d.id?"Checking...":"Download verified version"}</button>}
     {canManageLifecycle&&<div className="flex flex-wrap items-center gap-2">
      {!d.legalHoldAt&&<button type="button" disabled={!!lifecycleBusy}
       onClick={()=>void lifecycle(d.id,"LEGAL_HOLD")}
       className="rounded-md border border-amber-700 px-2 py-1 text-xs font-semibold text-amber-900 disabled:opacity-40">
       Place legal hold</button>}
      {!d.suppressedAt&&<button type="button" disabled={!!lifecycleBusy}
       onClick={()=>void lifecycle(d.id,"SUPPRESS")}
       className="rounded-md border border-red-600 px-2 py-1 text-xs font-semibold text-red-900 disabled:opacity-40">
       Suppress downloads</button>}
      {!d.retentionUntil&&<label className="flex items-center gap-1 text-xs font-semibold">
       Retain until
       <input type="date" value={retentionDates[d.id]??""}
        onChange={e=>setRetentionDates(prev=>({...prev,[d.id]:e.target.value}))}
        className="rounded-md border p-1"/>
       <button type="button" disabled={!!lifecycleBusy||!retentionDates[d.id]}
        onClick={()=>void lifecycle(d.id,"SET_RETENTION")}
        className="rounded-md border border-slate-400 px-2 py-1 disabled:opacity-40">
        Record approved date</button>
      </label>}
     </div>}
   </li>)}
  </ul>}
  {message&&<p role="status" className="text-sm text-emerald-800">{message}</p>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
  <p className="text-xs text-slate-500">
   Private object storage, bucket CORS, versioning and a configured scanner
   are required. This interface cannot bypass scan or grant requirements.
  </p>
 </section>;
}
