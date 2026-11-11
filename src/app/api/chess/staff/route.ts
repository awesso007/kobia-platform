import {NextResponse} from "next/server";
import {z} from "zod";
import {listChessAssignableStaff} from "@/lib/chess/appointments";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("businessId"));
  return NextResponse.json({employees:await listChessAssignableStaff(businessId)},{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
   error instanceof z.ZodError?"Invalid business":"Staff directory unavailable"},
   {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
 }
}
