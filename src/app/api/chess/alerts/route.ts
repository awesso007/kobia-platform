import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {listChessEmployeeAlerts,markChessAlertRead} from "@/lib/chess/employee-operations";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 return NextResponse.json({error:error instanceof PermissionError?"Forbidden":
  error instanceof z.ZodError?"Invalid request":"Unable to access alerts"},
  {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
}
export async function GET(request:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("businessId"));
  return NextResponse.json({alerts:await listChessEmployeeAlerts(businessId)},
   {headers:{"Cache-Control":"no-store"}});
 }catch(error){return fail(error);}
}
export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  const data=z.object({businessId:z.string().min(1).max(128),
   alertId:z.string().min(1).max(128)}).strict().parse(await request.json());
  return NextResponse.json(await markChessAlertRead(data.businessId,data.alertId));
 }catch(error){return fail(error);}
}
