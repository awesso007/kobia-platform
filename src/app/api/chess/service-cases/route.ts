import {assertMutationOrigin} from "@/lib/chess/request-security";
import {NextResponse} from "next/server";
import {z} from "zod";
import {openChessServiceCase,transitionChessServiceCase} from "@/lib/chess/regulated-services";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export async function POST(req: Request) {
 try { assertMutationOrigin(req);return NextResponse.json({serviceCase:await openChessServiceCase(await req.json())},{status:201});}
 catch(e){return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid request":"Request failed"},{status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});}
}

export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  const parsed=z.object({
   caseId:z.string().min(1).max(128),
   businessId:z.string().min(1).max(128),
   status:z.enum(["INTAKE","REVIEW","ACTIVE","HOLD","CLOSED"]),
  }).strict().parse(await req.json());
  return NextResponse.json(await transitionChessServiceCase(parsed.caseId,parsed.businessId,parsed.status));
 }catch(e){return NextResponse.json({
  error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid request":"Request failed",
 },{status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});}
}
