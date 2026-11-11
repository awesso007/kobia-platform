import {assertMutationOrigin} from "@/lib/chess/request-security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assignEmployee, revokeEmployeeAssignment } from "@/lib/chess/business-units";
import { PermissionError } from "@/lib/rbac/require-permission";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
 return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid request":"Request failed"},
 {status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});
}
export async function POST(request: Request) {
 try { assertMutationOrigin(request);return NextResponse.json({assignment:await assignEmployee(await request.json())},{status:201});}
 catch(e) {return fail(e);}
}
export async function DELETE(request: Request) {
 try { assertMutationOrigin(request);
  const input=z.object({businessId:z.string().min(1),clerkUserId:z.string().min(1)}).strict().parse(await request.json());
  const result=await revokeEmployeeAssignment(input.businessId,input.clerkUserId);
  return NextResponse.json({revoked:result.count>0});
 } catch(e) {return fail(e);}
}
