import {NextResponse} from "next/server";
import {z} from "zod";
import {listMyChessAppointmentTimes} from "@/lib/chess/appointments";
import {toPrivateChessCalendar} from "@/lib/chess/calendar-export";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Authenticated download containing generic events and no client data. */
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("businessId"));
  const own=await listMyChessAppointmentTimes(businessId);
  const content=toPrivateChessCalendar(own.map(appt=>({
   id:appt.id,dueAt:appt.startAt,endAt:appt.endAt,status:appt.status,kind:"APPOINTMENT" as const,
  })));
  return new NextResponse(content,{headers:{
   "Content-Type":"text/calendar; charset=utf-8",
   "Content-Disposition":"attachment; filename=\"chess-my-appointments.ics\"",
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff",
  }});
 }catch(error){
  return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
   error instanceof z.ZodError?"Invalid request":"Calendar unavailable"},
   {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
 }
}
