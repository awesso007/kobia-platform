import {NextResponse} from "next/server";
import {z} from "zod";
import {listChessPayrollDispatches} from "@/lib/chess/payroll-reconciliation";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(
   new URL(request.url).searchParams.get("businessId"));
  return NextResponse.json({dispatches:await listChessPayrollDispatches(businessId)},{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":status===400?
   "Invalid business":"Payroll statuses unavailable"},{status});
 }
}
