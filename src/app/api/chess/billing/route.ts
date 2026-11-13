import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {assertChessRateLimit,ChessRateLimitError} from "@/lib/chess/api-rate-limit";
import {PermissionError} from "@/lib/rbac/require-permission";
import {draftChessInvoice,reviewChessInvoice,listChessInvoices,voidChessInvoice}
 from "@/lib/chess/billing";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 if(error instanceof ChessRateLimitError)return NextResponse.json(
   {error:"Too many requests"},{status:429,headers:{
    "Retry-After":"60","Cache-Control":"no-store",
   }});
 const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":status===400?
  "Invalid invoice":"Billing unavailable"},{status});
}
export async function GET(req:Request){
 try{
  await assertChessRateLimit("billing_read");
  const businessId=z.string().min(1).max(128).parse(
   new URL(req.url).searchParams.get("businessId"));
  return NextResponse.json({invoices:await listChessInvoices(businessId)},{
   headers:{"Cache-Control":"private, no-store"},
  });
 }catch(e){return fail(e);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json({invoice:await draftChessInvoice(await req.json())},
   {status:201,headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json(await reviewChessInvoice(await req.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(e){return fail(e);}
}

/** Voiding is a state transition, not a record deletion or a provider action. */
export async function DELETE(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json(await voidChessInvoice(await req.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(e){return fail(e);}
}
