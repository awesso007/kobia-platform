import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {createChessRegulatedWorkflow,listChessRegulatedWorkflows,
 attestChessRegulatedChecklist,decideChessRegulatedWorkflow}
 from "@/lib/chess/regulated-workflows";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function fail(error:unknown){
 const status=error instanceof PermissionError?403:error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===403?"Forbidden":status===400?
  "Invalid workflow input":"Regulated workflow unavailable"},{status});
}
export async function GET(req:Request){
 try{
  const q=new URL(req.url).searchParams;
  return NextResponse.json({workflows:await listChessRegulatedWorkflows({
   businessId:q.get("businessId"),serviceCaseId:q.get("serviceCaseId"),
  })},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json({workflow:await createChessRegulatedWorkflow(await req.json())},
   {status:201,headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  const input=z.object({action:z.enum(["ATTEST","DECIDE"])}).passthrough()
   .parse(await req.json());
  const {action,...data}=input;
  const result=action==="ATTEST"?
   await attestChessRegulatedChecklist(data):await decideChessRegulatedWorkflow(data);
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
