import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {getChessManagerQueue,assignChessWorkItem} from "@/lib/chess/employee-operations";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
  error instanceof z.ZodError?"Invalid input":"Manager operation unavailable"},
  {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
}
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("businessId"));
  return NextResponse.json(await getChessManagerQueue(businessId),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){return fail(error);}
}
export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  const result=await assignChessWorkItem(await request.json());
  return NextResponse.json(result,{status:result.updated?200:409});
 }catch(error){return fail(error);}
}
