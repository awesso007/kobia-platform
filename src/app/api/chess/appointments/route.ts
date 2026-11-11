import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {createChessAppointment,listChessAppointments,cancelChessAppointment,completeChessAppointment,isAppointmentConflict} from "@/lib/chess/appointments";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 if(isAppointmentConflict(error))return NextResponse.json({
  error:"The selected employee has a conflicting appointment."
 },{status:409});
 return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
  error instanceof z.ZodError||error instanceof RangeError?"Invalid appointment":"Appointment operation unavailable"},
  {status:error instanceof PermissionError?403:
   error instanceof z.ZodError||error instanceof RangeError?400:503});
}
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("businessId"));
  return NextResponse.json({appointments:await listChessAppointments(businessId)},{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){return fail(error);}
}
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json({appointment:await createChessAppointment(await request.json())},{status:201});
 }catch(error){return fail(error);}
}
export async function DELETE(request:Request){
 try{
  assertMutationOrigin(request);
  const result=await cancelChessAppointment(await request.json());
  return NextResponse.json(result,{status:result.updated?200:409});
 }catch(error){return fail(error);}
}

export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  const result=await completeChessAppointment(await request.json());
  return NextResponse.json(result,{status:result.updated?200:409});
 }catch(error){return fail(error);}
}
