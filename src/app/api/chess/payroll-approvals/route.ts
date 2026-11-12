import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {requestChessPayrollApproval} from "@/lib/chess/payroll-approval-request";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** No generic payload digest is accepted. This issues a review request only. */
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  const approval=await requestChessPayrollApproval(await request.json());
  return NextResponse.json({approval},{
   status:201,headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":status===400?
   "Invalid payroll approval request":"Approval request unavailable"},{
   status,headers:{"Cache-Control":"no-store"},
  });
 }
}
