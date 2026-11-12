import Link from "next/link";
import {listBusinessUnits} from "@/lib/chess/business-units";
import {listChessActionApprovals} from "@/lib/chess/approvals";
import ApprovalClient from "./ApprovalClient";

export const dynamic="force-dynamic";

export default async function ChessActionApprovalPage({
 searchParams,
}:{searchParams:{businessId?:string}}){
 let businesses:Awaited<ReturnType<typeof listBusinessUnits>>=[];
 try{businesses=await listBusinessUnits();}
 catch{return <main role="alert" className="mx-auto max-w-4xl p-8">
  Approval workspace unavailable or access denied.</main>;}
 const selected=businesses.find(b=>b.id===searchParams.businessId)??businesses[0];
 if(!selected)return <main className="mx-auto max-w-4xl space-y-4 p-8">
  <h1 className="text-2xl font-semibold">Action approvals</h1>
  <p>No active business-unit assignment is available.</p>
 </main>;
 let rows:Awaited<ReturnType<typeof listChessActionApprovals>>=[];
 try{rows=await listChessActionApprovals(selected.id);}
 catch{return <main role="alert" className="mx-auto max-w-4xl p-8">
  Approval queue unavailable or access denied.</main>;}
 return <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
  <header>
   <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
    CHESS CORP 2 · Supervised operations
   </p>
   <h1 className="mt-1 text-3xl font-semibold text-slate-950">Action approval queue</h1>
   <p className="mt-2 text-sm text-slate-700">
    Requests and independent human decisions. Approval here only records
    review and does not execute payroll, banking, accounting, tax filings,
    licensed services, or external transfers.
   </p>
  </header>
  <nav aria-label="Business workspaces" className="flex flex-wrap gap-2">
   {businesses.map(b=><Link key={b.id}
    href={`/app/action-approvals?businessId=${encodeURIComponent(b.id)}`}
    className={`rounded-lg border px-3 py-2 text-sm font-semibold
     ${b.id===selected.id?"bg-emerald-800 text-white":"border-slate-200 text-slate-700"}`}>
     {b.name}
   </Link>)}
  </nav>
  <ApprovalClient key={selected.id} businessId={selected.id} approvals={rows.map(r=>({
   id:r.id,actionType:r.actionType,requestedBy:r.requestedBy,status:r.status,
   canReview:r.canReview,createdAt:r.createdAt.toISOString(),
   reviewedAt:r.reviewedAt?.toISOString()??null,
  }))}/>
  <Link href="/app/overview" className="text-sm font-semibold text-emerald-700 hover:underline">
   Return to overview
  </Link>
 </main>;
}
