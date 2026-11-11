import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {submitChessRegulatedHandoff,reconcileChessRegulatedHandoff}
 from "@/lib/chess/regulated-handoffs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":status===400?
  "Invalid handoff input":"Regulated partner unavailable"},{status});
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json(await submitChessRegulatedHandoff(await req.json()),
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json(await reconcileChessRegulatedHandoff(await req.json()),
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
