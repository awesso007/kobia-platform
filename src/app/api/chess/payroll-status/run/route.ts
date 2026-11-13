import {NextResponse} from "next/server";
import {assertAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
import {isAuthorizedRecurrenceWorker} from "@/lib/chess/recurring-work";
import {reconcileChessPayrollDispatches} from "@/lib/chess/payroll-reconciliation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Tenant-allowlisted machine-only payroll STATUS poller. Does not initiate
 * payroll runs, payments, deposits, tax filings or ACH disbursement. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token))
  return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  assertAuthorizedWorkflowTenant(false);
  const outcome=await reconcileChessPayrollDispatches();
  if(outcome.disabled)return NextResponse.json({error:"Payroll status disabled"},{status:503});
  return NextResponse.json(outcome,{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Payroll status unavailable"},{status:503});
 }
}
