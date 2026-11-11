import {NextResponse} from "next/server";
import {isAuthorizedRecurrenceWorker,runDueChessRecurrences} from "@/lib/chess/recurring-work";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Machine-only scheduler. The `t` tenant is validated and injected by middleware.
 * The bearer token is not a query parameter and must stay in the secret store. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token)){
  return NextResponse.json({error:"Forbidden"},{status:403});
 }
 try{
  const result=await runDueChessRecurrences();
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Scheduling unavailable"},{status:503});
 }
}
