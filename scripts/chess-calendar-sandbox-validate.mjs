// Explicitly opt-in, sandbox-only provider integration check.
// Uses a fictional appointment, never an employee's actual work schedule.
// Requires isolated sandbox gateway credentials and delegated test-calendar OAuth.
// It does not modify the CHESS tenant database or enable production sync.
import {randomUUID} from "node:crypto";

function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" must be configured");
 return value;
}
if(process.env.CHESS_CALENDAR_SANDBOX_VALIDATE!=="true")
 throw new Error("Sandbox calendar validation is disabled by default.");
if(process.env.CHESS_CALENDAR_SANDBOX_ISOLATED!=="true")
 throw new Error("Confirm an isolated, authorized test-calendar environment first.");
const host=required("CHESS_CALENDAR_ALLOWED_HOST");
const urlNames=["CHESS_CALENDAR_API_URL","CHESS_CALENDAR_CANCEL_API_URL","CHESS_CALENDAR_STATUS_API_URL"];
for(const key of urlNames){
 const url=new URL(required(key));
 if(url.protocol!=="https:"||url.hostname!==host||url.username||url.password)
  throw new Error(key+" must match the approved HTTPS sandbox host");
}
const apiKey=required("CHESS_CALENDAR_API_KEY");
const tenantSlug=required("CHESS_CALENDAR_SANDBOX_TENANT");
const businessId=required("CHESS_CALENDAR_SANDBOX_BUSINESS_ID");
const recipientClerkUserId=required("CHESS_CALENDAR_SANDBOX_STAFF_ID");
const appointmentId="sandbox-appointment-"+randomUUID();
const idempotencyKey="sandbox-calendar:"+appointmentId;
const startsAt=new Date(Date.now()+2*24*60*60*1000);
const endsAt=new Date(startsAt.getTime()+30*60*1000);
let providerEventId=null;
async function post(uri,payload,idempotency){
 const response=await fetch(required(uri),{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{
   Authorization:"Bearer "+apiKey,"Content-Type":"application/json",
   ...(idempotency?{"Idempotency-Key":idempotency}:{}),
  },
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)throw new Error(uri+" returned HTTP "+response.status);
 const data=await response.json();
 if(!data || typeof data!=="object" ||
  !["accepted","rejected","pending","not_found"].includes(data.status))
  throw new Error(uri+" returned an invalid status");
 return data;
}
try{
 const submission=await post("CHESS_CALENDAR_API_URL",{
  tenantSlug,businessId,appointmentId,recipientClerkUserId,
  startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),
  summary:"CHESS appointment",visibility:"private",idempotencyKey,
 },idempotencyKey);
 if(submission.status!=="accepted"||typeof submission.id!=="string")
  throw new Error("Gateway did not confirm an event with an ID");
 providerEventId=submission.id;
 const lookup=await post("CHESS_CALENDAR_STATUS_API_URL",{
  tenantSlug,businessId,appointmentId,providerEventId,
  idempotencyKey,action:"CREATE",
 });
 if(lookup.status!=="accepted"||lookup.id!==providerEventId)
  throw new Error("Gateway status did not reconcile the new event");
 console.log("PASS isolated appointment creation and event-status lookup");
}finally{
 if(providerEventId){
  try{
   const cancellation=await post("CHESS_CALENDAR_CANCEL_API_URL",{
    tenantSlug,businessId,appointmentId,recipientClerkUserId,providerEventId,
    idempotencyKey:"cancel:"+idempotencyKey,
   },"cancel:"+idempotencyKey);
   if(cancellation.status!=="accepted")
    throw new Error("Cancellation not confirmed by the calendar gateway");
   const status=await post("CHESS_CALENDAR_STATUS_API_URL",{
    tenantSlug,businessId,appointmentId,providerEventId,
    idempotencyKey:"cancel:"+idempotencyKey,action:"CANCEL",
   });
   if(status.status!=="accepted")
    throw new Error("Cancellation status still unconfirmed");
   console.log("PASS isolated appointment cancellation and status lookup");
  }catch(error){
   console.error("CLEANUP REQUIRED: sandbox calendar event remains unverified. Provider event ID:",providerEventId);
   console.error(error instanceof Error?error.message:String(error));
   process.exitCode=1;
  }
 }
}
