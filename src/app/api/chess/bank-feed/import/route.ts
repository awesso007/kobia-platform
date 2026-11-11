import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {importChessBankFeed} from "@/lib/chess/bank-feed";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json(await importChessBankFeed(await request.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  const status=error instanceof PermissionError?403:
   error instanceof z.ZodError||error instanceof RangeError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":
   status===400?"Invalid import request":"Bank import unavailable"},{status});
 }
}
