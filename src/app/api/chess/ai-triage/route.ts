import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {PermissionError} from "@/lib/rbac/require-permission";
import {suggestChessWorkItemTriage,reviewChessWorkItemTriage,
 listChessWorkItemTriage} from "@/lib/chess/ai-triage";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(e:unknown){
 const status=e instanceof PermissionError?403:e instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":
  status===400?"Invalid triage request":"AI review unavailable"},{status});
}
export async function GET(req:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(
   new URL(req.url).searchParams.get("businessId"));
  return NextResponse.json({suggestions:await listChessWorkItemTriage(businessId)},{
   headers:{"Cache-Control":"private, no-store"},
  });
 }catch(e){return fail(e);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json({suggestion:await suggestChessWorkItemTriage(await req.json())},
   {status:201,headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json(await reviewChessWorkItemTriage(await req.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(e){return fail(e);}
}
