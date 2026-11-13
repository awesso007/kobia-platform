import {NextResponse} from "next/server";
import {z} from "zod";
import {executeChessApprovedBankPosting} from "@/lib/chess/bank-review";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Manual three-person, release-flagged ledger posting. NEVER auto-enabled. */
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  const result=await executeChessApprovedBankPosting(await request.json());
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":
   status===400?"Invalid posting request":"Ledger outcome not confirmed; review source transaction before retry"},{
   status,headers:{"Cache-Control":"no-store"},
  });
 }
}
