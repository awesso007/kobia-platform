import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {registerChessBankFeed,activateChessBankFeed,listChessBankFeedConnections}
 from "@/lib/chess/bank-feed";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":
  status===400?"Invalid bank feed configuration":"Bank feed unavailable"},{status});
}
export async function GET(req:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(
   new URL(req.url).searchParams.get("businessId"));
  return NextResponse.json({connections:await listChessBankFeedConnections(businessId)},{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){return fail(error);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json({connection:await registerChessBankFeed(await req.json())},
   {status:201});
 }catch(error){return fail(error);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  const data=z.object({businessId:z.string().min(1).max(128),
   connectionId:z.string().min(1).max(128),active:z.boolean()}).strict()
   .parse(await req.json());
  return NextResponse.json(await activateChessBankFeed(data,data.active));
 }catch(error){return fail(error);}
}
