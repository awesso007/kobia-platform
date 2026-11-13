import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {reconcileChessApprovedBankPosting,resolveChessApprovedBankPostingOutcome} from "@/lib/chess/bank-review";
import {assertMutationOrigin} from "@/lib/chess/request-security";
export const runtime="nodejs";
export const dynamic="force-dynamic";

/** Authenticated financial read; NO POST and NO mutation or automatic retry.
 * Fail closed when approval, mapped entity, consent or ledger is uncertain. */
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams;
  const outcome=await reconcileChessApprovedBankPosting({
   businessId:query.get("businessId"),
   clientProfileId:query.get("clientProfileId"),
   serviceCaseId:query.get("serviceCaseId"),
   service:query.get("service"),reviewId:query.get("reviewId"),
  });
  return NextResponse.json({outcome},{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":
   status===400?"Invalid review source":"Ledger reconciliation unavailable"},{
   status,headers:{"Cache-Control":"no-store"},
  });
 }
}

/** A separate, default-OFF fourth-party verification of a posted legacy
 * journal only. It never posts, retries or marks UNPOSTED as FAILED. */
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json(await resolveChessApprovedBankPostingOutcome(await request.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":
   status===400?"Invalid review source":"Ledger resolution unavailable"},{
    status,headers:{"Cache-Control":"no-store"},
  });
 }
}
