import {NextResponse} from "next/server";
import {assertAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
import {isAuthorizedRecurrenceWorker} from "@/lib/chess/recurring-work";
import {runChessAiTriage} from "@/lib/chess/ai-triage-worker";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Private machine-only tenant worker. All suggestions remain unapproved. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token))
  return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  assertAuthorizedWorkflowTenant(false);
  const outcome=await runChessAiTriage();
  if(outcome.disabled)return NextResponse.json({error:"AI triage disabled"},{status:503});
  return NextResponse.json(outcome,{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"AI triage unavailable"},{status:503});
 }
}
