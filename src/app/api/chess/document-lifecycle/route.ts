import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {updateChessDocumentLifecycle} from "@/lib/chess/document-lifecycle";
import {reconcileChessUnknownDocumentDisposal} from "@/lib/chess/document-purge-reconcile";
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

/** M3: explicit admin-only UNKNOWN review. Never re-DELETE an S3 version.
 * A present version or any ambiguous HEAD outcome remains UNKNOWN. */
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json(await reconcileChessUnknownDocumentDisposal(await req.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
   error instanceof z.ZodError?"Invalid request":"Document reconciliation unavailable"},{
    status:error instanceof PermissionError?403:
     error instanceof z.ZodError?400:503,
    headers:{"Cache-Control":"no-store"},
  });
 }
}
