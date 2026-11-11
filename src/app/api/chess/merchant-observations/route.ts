import {NextResponse} from "next/server";
import {z} from "zod";
import {listChessMerchantObservations} from "@/lib/chess/merchant-observations";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertChessRateLimit,ChessRateLimitError} from "@/lib/chess/api-rate-limit";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 try{
  await assertChessRateLimit("billing_read");
  const businessId=z.string().min(1).max(128).parse(
   new URL(req.url).searchParams.get("businessId"));
  const events=await listChessMerchantObservations(businessId);
  return NextResponse.json({events:events.map(e=>({
   ...e,occurredAt:e.occurredAt.toISOString(),
   receivedAt:e.receivedAt.toISOString(),
  }))},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  const status=e instanceof ChessRateLimitError?429:
   e instanceof PermissionError?403:e instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===429?"Too many requests":
   status===403?"Forbidden":status===400?"Invalid request":"Unavailable"},{
   status,headers:{"Cache-Control":"no-store",
    ...(status===429?{"Retry-After":"60"}:{})},
  });
 }
}
