import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {assertChessRateLimit,ChessRateLimitError} from "@/lib/chess/api-rate-limit";
import {PermissionError} from "@/lib/rbac/require-permission";
import {sendChessInvoice,reconcileChessInvoice} from "@/lib/chess/billing";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 if(error instanceof ChessRateLimitError)return NextResponse.json(
   {error:"Too many requests"},{status:429,headers:{
    "Retry-After":"60","Cache-Control":"no-store",
   }});
 const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":status===400?
  "Invalid request":"Billing provider unavailable"},{status});
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_delivery");
  return NextResponse.json(await sendChessInvoice(await req.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(e){return fail(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_delivery");
  return NextResponse.json(await reconcileChessInvoice(await req.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(e){return fail(e);}
}
