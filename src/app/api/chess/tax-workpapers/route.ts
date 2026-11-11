import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {createChessTaxWorkpaper,listChessTaxWorkpapers,reviewChessTaxWorkpaper}
 from "@/lib/chess/tax-workpapers";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 const status=error instanceof PermissionError?403:
  error instanceof z.ZodError||error instanceof RangeError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":
  status===400?"Invalid workpaper":"Tax workpaper unavailable"},{status});
}
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams;
  const businessId=z.string().min(1).max(128).parse(query.get("businessId"));
  const clientProfileId=z.string().min(1).max(128).parse(query.get("clientProfileId"));
  const serviceCaseId=z.string().min(1).max(128).parse(query.get("serviceCaseId"));
  return NextResponse.json({workpapers:await listChessTaxWorkpapers(
   businessId,clientProfileId,serviceCaseId,
  )},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return fail(error);}
}
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json({workpaper:await createChessTaxWorkpaper(await request.json())},
   {status:201,headers:{"Cache-Control":"no-store"}});
 }catch(error){return fail(error);}
}
export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json(await reviewChessTaxWorkpaper(await request.json()),
   {headers:{"Cache-Control":"no-store"}});
 }catch(error){return fail(error);}
}
