import Link from "next/link";
import {regulatedCaseAccess} from "@/lib/chess/regulated-access";
import {listChessRegulatedWorkflows} from "@/lib/chess/regulated-workflows";
import {regulatedHandoffConfigured} from "@/lib/chess/regulated-handoff-provider";
import RegulatedWorkflowClient from "./RegulatedWorkflowClient";
import {listChessServiceDocuments} from "@/lib/chess/documents";
import ServiceDocumentPanel from "../../client-documents/ServiceDocumentPanel";
import {documentLifecycleEnabled} from "@/lib/chess/document-lifecycle";
export const dynamic="force-dynamic";

export default async function ChessRegulatedCasePage({
 params,searchParams,
}:{params:{caseId:string};searchParams:{businessId?:string}}){
 const businessId=searchParams.businessId??"";
 const denied=<main role="alert" className="mx-auto max-w-5xl px-6 py-10">
  Regulated service case unavailable or permission denied.
 </main>;
 try{
  const access=await regulatedCaseAccess(businessId,params.caseId);
  const [raw,profile,docs]=await Promise.all([
   listChessRegulatedWorkflows({businessId,serviceCaseId:params.caseId}),
   access.db.clientProfile.findUnique({where:{id:access.record.clientProfileId},
    select:{displayName:true}}),
   access.db.chessClientDocument.findMany({where:{
    businessId,clientProfileId:access.record.clientProfileId,
    service:access.record.service,status:"READY",
    storageVersionId:{not:null},checksumSha256:{not:null},
   },select:{id:true,fileName:true},orderBy:{createdAt:"desc"},take:50}),
  ]);
  const documents=await listChessServiceDocuments(
   businessId,access.record.clientProfileId,access.service);
  if(!profile)return denied;
  return <main className="mx-auto max-w-6xl space-y-7 px-6 py-10">
   <header>
    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
     CHESS CORP 2 · Regulated coordination · {access.service.replaceAll("_"," ")}
    </p>
    <h1 className="mt-2 text-3xl font-semibold">{profile.displayName}</h1>
    <p className="mt-1 text-sm text-slate-600">
     Client service case {params.caseId}
    </p>
   </header>
   <RegulatedWorkflowClient
    businessId={businessId} serviceCaseId={params.caseId}
    service={access.service} partnerReady={regulatedHandoffConfigured(access.service)}
    documents={docs} workflows={raw.map(w=>({
     ...w,createdAt:w.createdAt.toISOString(),
     updatedAt:w.updatedAt.toISOString(),
     checklist:w.checklist.map(item=>({
      ...item,completedAt:item.completedAt?.toISOString()??null,
     })),
    }))}/>
   <ServiceDocumentPanel businessId={businessId}
    clientProfileId={access.record.clientProfileId} service={access.service}
    canUpload={documents.canUpload}
    canManageLifecycle={documents.canUpload&&
     ["OWNER","ADMIN"].includes(access.actor.role)&&documentLifecycleEnabled()}
    documents={documents.records.map(d=>({
     ...d,actualBytes:d.actualBytes??null,
     createdAt:d.createdAt.toISOString(),
     verifiedAt:d.verifiedAt?.toISOString()??null,
     retentionUntil:d.retentionUntil?.toISOString()??null,
     legalHoldAt:d.legalHoldAt?.toISOString()??null,
     suppressedAt:d.suppressedAt?.toISOString()??null,
    }))}/>
   <Link className="text-sm font-semibold text-emerald-800"
    href={`/app/regulated-services?businessId=${encodeURIComponent(businessId)}`}>
    Return to regulated service operations
   </Link>
  </main>;
 }catch{return denied;}
}
