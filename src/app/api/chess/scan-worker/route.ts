import {NextResponse} from "next/server";
import {isAuthorizedScanWorker,scanPendingChessDocuments,scanWorkerInput} from "@/lib/chess/clamav-worker";
import {z} from "zod";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedScanWorker(token))return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  const body:unknown=await request.json();
  const {limit}=scanWorkerInput.parse(body);
  return NextResponse.json(await scanPendingChessDocuments(limit),{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:error instanceof z.ZodError?"Invalid request":"Scanning service unavailable"},
   {status:error instanceof z.ZodError?400:503});
 }
}
