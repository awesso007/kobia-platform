import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {assertChessRateLimit,ChessRateLimitError} from "@/lib/chess/api-rate-limit";
import {createChessRecurringPlan,approveChessRecurringPlan,
 pauseChessRecurringPlan,listChessRecurringPlans} from "@/lib/chess/recurring-billing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
function failure(e:unknown){
 const status=e instanceof ChessRateLimitError?429:
  e instanceof PermissionError?403:e instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===429?"Too many requests":
  status===403?"Forbidden":status===400?"Invalid recurring plan":"Unavailable"},{
  status,headers:{...noStore,...(status===429?{"Retry-After":"60"}:{})},
 });
}
export async function GET(req:Request){
 try{
  await assertChessRateLimit("billing_read");
  const businessId=z.string().min(1).max(128).parse(
   new URL(req.url).searchParams.get("businessId"));
  const plans=await listChessRecurringPlans(businessId);
  return NextResponse.json({plans:plans.map(p=>({
   ...p,createdAt:p.createdAt.toISOString(),
   updatedAt:p.updatedAt.toISOString(),
   nextDraftAt:p.nextDraftAt.toISOString(),
   lastDraftAt:p.lastDraftAt?.toISOString()??null,
   approvedAt:p.approvedAt?.toISOString()??null,
  }))},{headers:noStore});
 }catch(e){return failure(e);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json(await createChessRecurringPlan(await req.json()),{
   status:201,headers:noStore,
  });
 }catch(e){return failure(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json(await approveChessRecurringPlan(await req.json()),{
   headers:noStore,
  });
 }catch(e){return failure(e);}
}
export async function DELETE(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json(await pauseChessRecurringPlan(await req.json()),{
   headers:noStore,
  });
 }catch(e){return failure(e);}
}
