import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {verifyChessPractitionerCredential} from "@/lib/chess/license-registry";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json(await verifyChessPractitionerCredential(await request.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({error:error instanceof PermissionError?"Forbidden":error instanceof z.ZodError?"Invalid request":"Registry unavailable"},
   {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
 }
}
