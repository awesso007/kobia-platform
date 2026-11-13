import {NextResponse} from "next/server";
import {getChessWorkerHealth} from "@/lib/chess/worker-health";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  return NextResponse.json(await getChessWorkerHealth(),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({error:error instanceof PermissionError?"Forbidden":"Worker metrics unavailable"},
   {status:error instanceof PermissionError?403:503});
 }
}
