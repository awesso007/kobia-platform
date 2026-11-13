import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {requestChessPayrollApproval} from "@/lib/chess/payroll-approval-request";
import {listChessPayrollApprovalEvidence,reviewChessPayrollSourceApproval} from "@/lib/chess/payroll-approval-review";
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


/** Reviewer must name the exact case and posted run; no unscoped private roster. */
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams;
  const evidence=await listChessPayrollApprovalEvidence({
   businessId:query.get("businessId"),
   clientProfileId:query.get("clientProfileId"),
   serviceCaseId:query.get("serviceCaseId"),
   legacyPayRunId:query.get("legacyPayRunId"),
  });
  return NextResponse.json({evidence},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":status===400?
   "Invalid payroll review source":"Review evidence unavailable"},{
   status,headers:{"Cache-Control":"no-store"},
  });
 }
}
export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  const review=await reviewChessPayrollSourceApproval(await request.json());
  return NextResponse.json({review},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":status===400?
   "Invalid payroll review decision":"Review decision unavailable"},{
   status,headers:{"Cache-Control":"no-store"},
  });
 }
}
