import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {
 myDelegatedCalendarStatus,startMyDelegatedCalendarConnection,
 disconnectMyDelegatedCalendar,
} from "@/lib/chess/calendar-oauth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
function failure(error:unknown){
 return NextResponse.json({
  error:error instanceof PermissionError?"Forbidden":
   error instanceof z.ZodError?"Invalid request":"Delegated calendar gateway unavailable",
 },{status:error instanceof PermissionError?403:
  error instanceof z.ZodError?400:503,headers:noStore});
}
export async function GET(){
 try{return NextResponse.json(await myDelegatedCalendarStatus(),{headers:noStore});}
 catch(error){return failure(error);}
}
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  z.object({}).strict().parse(await request.json());
  return NextResponse.json(await startMyDelegatedCalendarConnection(),{
   headers:noStore,status:201,
  });
 }catch(error){return failure(error);}
}
export async function DELETE(request:Request){
 try{
  assertMutationOrigin(request);
  z.object({}).strict().parse(await request.json());
  return NextResponse.json(await disconnectMyDelegatedCalendar(),{headers:noStore});
 }catch(error){return failure(error);}
}
