import {assertMutationOrigin} from "@/lib/chess/request-security";
import {NextResponse} from "next/server";
import {z} from "zod";
import {createChessWorkItem,listChessWorkItems,transitionChessWorkItem,WorkItemConflictError} from "@/lib/chess/workflow";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs"; export const dynamic="force-dynamic";
function failure(e:unknown){return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid request":"Request failed"},{status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});}
export async function GET(req:Request){
 try{
  const businessId=z.string().min(1).max(128).parse(new URL(req.url).searchParams.get("businessId"));
  return NextResponse.json({workItems:await listChessWorkItems(businessId)});
 }catch(e){return failure(e);}
}
export async function POST(req: Request) {
 try { assertMutationOrigin(req);return NextResponse.json({workItem:await createChessWorkItem(await req.json())},{status:201});}
 catch(e){return failure(e);}
}

/** An explicit expectedUpdatedAt prevents a stale employee tab from
 * overwriting work already changed by another user. */
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json({workItem:await transitionChessWorkItem(await req.json())});
 }catch(error){
  if(error instanceof WorkItemConflictError)
   return NextResponse.json({error:"Work item was changed; refresh before updating."},{status:409});
  return failure(error);
 }
}
