import {NextResponse} from "next/server";
import {incidentMonitorAuthorized,getChessIncidentHealth}
 from "@/lib/chess/incident-monitor";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
/** Machine-only, token-authorized polling endpoint. External monitor must
 * independently configure alert routing, escalation, and incident owners. */
export async function GET(req:Request){
 if(!incidentMonitorAuthorized(req.headers.get("authorization")))
  return NextResponse.json({error:"Forbidden"},{status:403,headers:noStore});
 try{
  const status=await getChessIncidentHealth();
  return NextResponse.json(status,{
   status:status.healthy?200:503,headers:noStore,
  });
 }catch{
  return NextResponse.json({error:"Unhealthy or monitoring unavailable"},
   {status:503,headers:noStore});
 }
}
