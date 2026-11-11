import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {
 registerChessRegulatedAffiliation,verifyChessRegulatedAffiliation,
 listChessRegulatedAffiliations,
} from "@/lib/chess/regulated-affiliations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":status===400?
  "Invalid affiliation input":"Official verification unavailable"},{status});
}
export async function GET(req:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(
   new URL(req.url).searchParams.get("businessId"));
  return NextResponse.json({affiliations:await listChessRegulatedAffiliations(businessId)},
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json({affiliation:await registerChessRegulatedAffiliation(await req.json())},
   {status:201,headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json(await verifyChessRegulatedAffiliation(await req.json()),
   {headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
