import {assertMutationOrigin} from "@/lib/chess/request-security";
import {NextResponse} from "next/server";
import {z} from "zod";
import {requestClientConsent} from "@/lib/chess/onboarding";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export async function POST(req: Request) {
 try { assertMutationOrigin(req);return NextResponse.json({consent:await requestClientConsent(await req.json())},{status:201});}
 catch(e){return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid input":"Request failed"},
  {status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});}
}
