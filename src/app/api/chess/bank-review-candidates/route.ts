import {NextResponse} from "next/server";
import {listChessBankReviewCandidates} from "@/lib/chess/bank-review";
import {PermissionError} from "@/lib/rbac/require-permission";
import {z} from "zod";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams;
  const context={
   businessId:query.get("businessId"),
   clientProfileId:query.get("clientProfileId"),
   serviceCaseId:query.get("serviceCaseId"),
   service:query.get("service"),
  };
  return NextResponse.json(await listChessBankReviewCandidates(context),{
   headers:{"Cache-Control":"private, no-store"},
  });
 }catch(error){
  const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":
   status===400?"Invalid selection":"Ledger unavailable"},{status});
 }
}
