import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {listChessBankReviews,suggestChessBankReview,reviewChessBankSuggestion} from "@/lib/chess/bank-review";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":
  status===400?"Invalid input":"Bank review unavailable"},{status});
}
export async function GET(request:Request){
 try{
  const query=new URL(request.url).searchParams;
  const data={
   businessId:query.get("businessId"),clientProfileId:query.get("clientProfileId"),
   serviceCaseId:query.get("serviceCaseId"),service:query.get("service"),
  };
  return NextResponse.json({reviews:await listChessBankReviews(data)},{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){return fail(error);}
}
export async function POST(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json({review:await suggestChessBankReview(await request.json())},
   {status:201,headers:{"Cache-Control":"no-store"}});
 }catch(error){return fail(error);}
}
export async function PATCH(request:Request){
 try{
  assertMutationOrigin(request);
  return NextResponse.json(await reviewChessBankSuggestion(await request.json()),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){return fail(error);}
}
