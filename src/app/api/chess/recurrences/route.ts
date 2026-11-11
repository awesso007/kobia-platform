import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {createChessRecurrence,listChessRecurrences,setChessRecurrenceActive} from "@/lib/chess/recurring-work";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
  error instanceof z.ZodError||error instanceof RangeError?"Invalid recurrence":"Unable to process recurrence"},
  {status:error instanceof PermissionError?403:error instanceof z.ZodError||error instanceof RangeError?400:503});
}
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("businessId"));
  return NextResponse.json({recurrences:await listChessRecurrences(businessId)},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return fail(error);}
}
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json({recurrence:await createChessRecurrence(await request.json())},{status:201});
 }catch(error){return fail(error);}
}
export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  const data=z.object({businessId:z.string().min(1).max(128),
   id:z.string().min(1).max(128),active:z.boolean(),
   expectedUpdatedAt:z.string().datetime()}).strict().parse(await request.json());
  return NextResponse.json(await setChessRecurrenceActive(
   data.businessId,data.id,data.active,data.expectedUpdatedAt,
  ));
 }catch(error){return fail(error);}
}
