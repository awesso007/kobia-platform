import {NextResponse} from "next/server";
import {z} from "zod";
import {requestChessApproval,reviewChessApproval} from "@/lib/chess/approvals";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
function failure(e:unknown){return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid request":"Request failed"},{status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});}
export async function POST(req:Request){
 try{return NextResponse.json({approval:await requestChessApproval(await req.json())},{status:201});}
 catch(e){return failure(e);}
}
export async function PATCH(req:Request){
 try{
  const input=z.object({id:z.string().min(1),businessId:z.string().min(1),decision:z.enum(["APPROVED","REJECTED"])}).strict().parse(await req.json());
  return NextResponse.json({result:await reviewChessApproval(input.id,input.businessId,input.decision)});
 }catch(e){return failure(e);}
}
