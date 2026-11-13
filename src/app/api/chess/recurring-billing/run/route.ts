import {NextResponse} from "next/server";
import {assertAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
import {isAuthorizedRecurrenceWorker} from "@/lib/chess/recurring-work";
import {runChessRecurringInvoiceDrafts} from "@/lib/chess/recurring-billing";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Private machine-only execution. It creates pending invoice drafts, NEVER
 * delivers them, debits a bank, posts a GL journal or processes a refund. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token))
  return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  assertAuthorizedWorkflowTenant(false);
  const result=await runChessRecurringInvoiceDrafts();
  if(result.disabled)return NextResponse.json({error:"Recurring billing is disabled"},{
   status:503,headers:{"Cache-Control":"no-store"},
  });
  return NextResponse.json(result,{
   status:result.backlog?503:200,headers:{"Cache-Control":"no-store"},
  });
 }catch{
  return NextResponse.json({error:"Recurring draft creation unavailable"},{
   status:503,headers:{"Cache-Control":"no-store"},
  });
 }
}
