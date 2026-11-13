import {assertMutationOrigin} from "@/lib/chess/request-security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createBusinessUnit, listBusinessUnits } from "@/lib/chess/business-units";
import { PermissionError } from "@/lib/rbac/require-permission";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
 return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid request":"Request failed"},
  {status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});
}
export async function GET() {
 try { return NextResponse.json({businesses:await listBusinessUnits()}); } catch(e) {return fail(e);}
}
export async function POST(request: Request) {
 try { assertMutationOrigin(request);return NextResponse.json({business:await createBusinessUnit(await request.json())},{status:201});}
 catch(e) {return fail(e);}
}
