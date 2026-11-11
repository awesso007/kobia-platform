import {NextResponse} from "next/server";
import {z} from "zod";
import {getMyCalendarPreference,setMyCalendarPreference} from "@/lib/chess/calendar-preferences";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
  error instanceof z.ZodError?"Invalid calendar preference":"Request failed"},
  {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
}
export async function GET(){
 try{return NextResponse.json(await getMyCalendarPreference(),{headers:{"Cache-Control":"no-store"}});}
 catch(error){return fail(error);}
}
export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json(await setMyCalendarPreference(await request.json()));
 }catch(error){return fail(error);}
}
