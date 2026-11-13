import {NextResponse} from "next/server";
import {ZodError} from "zod";
import {acceptClientConsent,withdrawOwnClientConsent} from "@/lib/chess/client-consent";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
function failure(e:unknown){
 return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof ZodError?"Invalid consent request":"Request failed"},
  {status:e instanceof PermissionError?403:e instanceof ZodError?400:500});
}
export async function POST(req:Request){
 try{assertMutationOrigin(req);return NextResponse.json(await acceptClientConsent(await req.json()));}
 catch(e){return failure(e);}
}
export async function DELETE(req:Request){
 try{assertMutationOrigin(req);const body:unknown=await req.json();
  if(!body||typeof body!=="object"||!("consentId" in body)||typeof body.consentId!=="string") {
   return NextResponse.json({error:"Invalid consent request"},{status:400});
  }
  return NextResponse.json(await withdrawOwnClientConsent(body.consentId));}
 catch(e){return failure(e);}
}
