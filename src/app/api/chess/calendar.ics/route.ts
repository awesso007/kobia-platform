import {NextResponse} from "next/server";
import {z} from "zod";
import {listChessWorkItems} from "@/lib/chess/workflow";
import {toPrivateChessCalendar} from "@/lib/chess/calendar-export";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("businessId"));
  const tasks=await listChessWorkItems(businessId);
  const calendar=toPrivateChessCalendar(tasks);
  return new NextResponse(calendar,{status:200,headers:{
   "Content-Type":"text/calendar; charset=utf-8",
   "Content-Disposition":"attachment; filename=\"chess-work-items.ics\"",
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff",
  }});
 }catch(error){
  return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
   error instanceof z.ZodError?"Invalid business":"Calendar unavailable"},
   {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
 }
}
