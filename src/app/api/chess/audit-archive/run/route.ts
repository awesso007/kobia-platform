import {NextResponse} from "next/server";
import {assertAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
import {isAuthorizedRecurrenceWorker} from "@/lib/chess/recurring-work";
import {runChessAuditArchive} from "@/lib/chess/audit-archive";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token))
  return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  assertAuthorizedWorkflowTenant(false);
  const report=await runChessAuditArchive();
  if(report.disabled)return NextResponse.json({error:"Audit export disabled"},{status:503});
  return NextResponse.json(report,{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Audit export unavailable"},{status:503});
 }
}
