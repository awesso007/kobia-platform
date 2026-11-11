import {NextResponse} from "next/server";
import {z} from "zod";
import {previewChessApprovedBankPosting} from "@/lib/chess/bank-review";
import {PermissionError} from "@/lib/rbac/require-permission";

export const runtime="nodejs";
export const dynamic="force-dynamic";

/** Read-only finance plan. Neither GET nor the planner posts a journal entry. */
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams;
  const preview=await previewChessApprovedBankPosting({
   businessId:query.get("businessId"),
   clientProfileId:query.get("clientProfileId"),
   serviceCaseId:query.get("serviceCaseId"),
   service:query.get("service"),
   reviewId:query.get("reviewId"),
  });
  return NextResponse.json(preview,{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":
   status===400?"Invalid input":"Preview unavailable"},{
   status,headers:{"Cache-Control":"no-store"},
  });
 }
}
