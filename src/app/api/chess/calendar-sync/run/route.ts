import {NextResponse} from "next/server";
import {isAuthorizedRecurrenceWorker} from "@/lib/chess/recurring-work";
import {syncChessPendingCalendarEvents} from "@/lib/chess/calendar-sync";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Machine-only calendar bridge; tenant is resolved by the validated `t`
 * query parameter and never by an untrusted x-tenant header. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!isAuthorizedRecurrenceWorker(token))
  return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  return NextResponse.json(await syncChessPendingCalendarEvents(),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch{
  return NextResponse.json({error:"Calendar synchronization unavailable"},{status:503});
 }
}
