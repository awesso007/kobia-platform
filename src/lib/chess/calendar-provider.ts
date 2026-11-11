import {z} from "zod";

export type CalendarEventSubmission={
 tenantSlug:string;
 businessId:string;
 workItemId:string;
 recipientClerkUserId:string;
 startsAt:string;
 endsAt:string;
 summary:"CHESS work item";
 visibility:"private";
 idempotencyKey:string;
};
const result=z.object({
 id:z.string().min(1).max(250),
 status:z.enum(["accepted","rejected"]),
}).strict();

/** Approved provider gateway must handle delegated Google/Microsoft OAuth
 * and check user consent. No arbitrary remote URLs or client record details
 * may be supplied by the application caller. */
export function calendarGatewayConfigured():boolean{
 if(process.env.CHESS_CALENDAR_SYNC_ENABLED!=="true")return false;
 const raw=process.env.CHESS_CALENDAR_API_URL;
 const cancel=process.env.CHESS_CALENDAR_CANCEL_API_URL;
 const status=process.env.CHESS_CALENDAR_STATUS_API_URL;
 const host=process.env.CHESS_CALENDAR_ALLOWED_HOST;
 const key=process.env.CHESS_CALENDAR_API_KEY;
 if(!raw||!cancel||!status||!host||!key)return false;
 try{
  return [raw,cancel,status].every(uri=>{
   const url=new URL(uri);
   return url.protocol==="https:"&&url.hostname===host&&!url.username&&!url.password&&!url.hash;
  });
 }catch{return false;}
}
export async function submitCalendarEvent(input:CalendarEventSubmission){
 if(!calendarGatewayConfigured())throw new Error("Calendar gateway is disabled or unconfigured.");
 const response=await fetch(process.env.CHESS_CALENDAR_API_URL!,{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{
   "Authorization":`Bearer ${process.env.CHESS_CALENDAR_API_KEY!}`,
   "Content-Type":"application/json",
   "Idempotency-Key":input.idempotencyKey,
  },
  body:JSON.stringify(input),signal:AbortSignal.timeout(10000),
 });
 if(!response.ok)throw new Error(`Calendar gateway returned HTTP ${response.status}`);
 return result.parse(await response.json());
}

/** Provider must implement an idempotent cancellation endpoint.
 * The previously issued providerEventId identifies the private event. */
export async function cancelCalendarEvent(input:{
 tenantSlug:string;businessId:string;workItemId:string;
 recipientClerkUserId:string;providerEventId:string;idempotencyKey:string;
}){
 if(!calendarGatewayConfigured())throw new Error("Calendar cancellation is disabled or unconfigured.");
 const response=await fetch(process.env.CHESS_CALENDAR_CANCEL_API_URL!,{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{
   "Authorization":`Bearer ${process.env.CHESS_CALENDAR_API_KEY!}`,
   "Content-Type":"application/json",
   "Idempotency-Key":input.idempotencyKey,
  },
  body:JSON.stringify(input),signal:AbortSignal.timeout(10000),
 });
 if(!response.ok)throw new Error(`Calendar cancellation HTTP ${response.status}`);
 return result.parse(await response.json());
}


const lookupResult=z.object({
 id:z.string().min(1).max(250).optional(),
 status:z.enum(["accepted","rejected","pending","not_found"]),
}).strict();
export type CalendarLookupStatus=z.infer<typeof lookupResult>["status"];

/** Status lookup is required to reconcile network-uncertain create/delete.
 * Never blindly resend a financial-services calendar event. */
export async function lookupCalendarEvent(input:{
 tenantSlug:string;businessId:string;workItemId:string;
 idempotencyKey:string;providerEventId:string|null;
 action:"CREATE"|"CANCEL";
}){
 if(!calendarGatewayConfigured())throw new Error("Calendar gateway is disabled.");
 const response=await fetch(process.env.CHESS_CALENDAR_STATUS_API_URL!,{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{
   "Authorization":`Bearer ${process.env.CHESS_CALENDAR_API_KEY!}`,
   "Content-Type":"application/json",
  },
  body:JSON.stringify(input),signal:AbortSignal.timeout(10000),
 });
 if(!response.ok)throw new Error(`Calendar status lookup HTTP ${response.status}`);
 const parsed=lookupResult.parse(await response.json());
 if(parsed.status==="accepted"&&!parsed.id&&input.action==="CREATE")
  throw new Error("Provider accepted event without an event identifier.");
 return parsed;
}
