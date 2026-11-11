import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {updateChessDocumentLifecycle} from "@/lib/chess/document-lifecycle";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json(await updateChessDocumentLifecycle(await req.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
   error instanceof z.ZodError||error instanceof RangeError?"Invalid request":
   "Document lifecycle unavailable"},{
    status:error instanceof PermissionError?403:
     error instanceof z.ZodError||error instanceof RangeError?400:503,
    headers:{"Cache-Control":"no-store"},
   });
 }
}
