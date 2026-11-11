import {NextResponse} from "next/server";
import {z} from "zod";
import {verifyScanSignature,recordDocumentScan} from "@/lib/chess/document-scanning";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Server-to-server only. The scanner must sign timestamp + tenant + raw body.
 * Authorization is independent from user cookies and Clerk sessions. */
export async function POST(req:Request) {
 const tenant=new URL(req.url).searchParams.get("t") ?? "";
 if(!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(tenant)) {
  return NextResponse.json({error:"Forbidden"},{status:403});
 }
 const raw=await req.text();
 if(!verifyScanSignature(raw,req.headers.get("x-chess-scan-timestamp")??"",
    req.headers.get("x-chess-scan-signature")??"",tenant)) {
  return NextResponse.json({error:"Forbidden"},{status:403});
 }
 try{
  const parsed:unknown=JSON.parse(raw);
  return NextResponse.json(await recordDocumentScan(parsed));
 }catch(e){
  return NextResponse.json({error:e instanceof z.ZodError?"Invalid scanner response":"Scanner confirmation failed"},
   {status:e instanceof z.ZodError?400:503});
 }
}
