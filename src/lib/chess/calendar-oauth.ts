import {randomUUID} from "node:crypto";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {maySyncCalendar,maySyncAppointmentCalendar} from "./calendar-preferences";

const status=z.object({
 tenantSlug:z.string().min(1).max(100),
 clerkUserId:z.string().min(1).max(128),
 state:z.enum(["CONNECTED","DISCONNECTED","PENDING","EXPIRED"]),
 scopes:z.array(z.enum(["TASKS","APPOINTMENTS"])).max(2),
 checkedAt:z.string().datetime(),
}).strict();
const startResult=z.object({
 tenantSlug:z.string().min(1).max(100),
 clerkUserId:z.string().min(1).max(128),
 nonce:z.string().uuid(),
 connectUrl:z.string().url(),
 expiresAt:z.string().datetime(),
 state:z.literal("PENDING"),
}).strict();
const revokeResult=z.object({
 tenantSlug:z.string().min(1).max(100),
 clerkUserId:z.string().min(1).max(128),
 revoked:z.literal(true),
}).strict();

export function delegatedCalendarOAuthConfigured(){
 if(process.env.CHESS_CALENDAR_OAUTH_ENABLED!=="true"||
  process.env.CHESS_CALENDAR_OAUTH_PROVIDER_CERTIFIED!=="true")
  return false;
 const host=process.env.CHESS_CALENDAR_OAUTH_ALLOWED_HOST;
 const key=process.env.CHESS_CALENDAR_OAUTH_API_KEY;
 const endpoints=[
  process.env.CHESS_CALENDAR_OAUTH_START_URL,
  process.env.CHESS_CALENDAR_OAUTH_STATUS_URL,
  process.env.CHESS_CALENDAR_OAUTH_REVOKE_URL,
 ];
 if(!host||!key||endpoints.some(x=>!x))return false;
 try{return endpoints.every(x=>{
  const u=new URL(x!);
  return u.protocol==="https:"&&u.hostname===host&&
   !u.username&&!u.password&&!u.hash&&!u.port;
 });}catch{return false;}
}
function assertGatewayUrl(raw:string){
 const url=new URL(raw);
 if(url.protocol!=="https:"||
  url.hostname!==process.env.CHESS_CALENDAR_OAUTH_ALLOWED_HOST||
  !!url.username||!!url.password||!!url.hash||!!url.port)
  throw new Error("Unapproved delegated OAuth redirect origin.");
 return url.toString();
}
async function actor(){
 const user=await getCurrentMembership();
 if(!user||user.status!=="ACTIVE"||user.role==="VIEWER")
  throw new PermissionError("record:read");
 return user;
}
async function post(url:string,input:object){
 if(!delegatedCalendarOAuthConfigured())
  throw new Error("Delegated employee calendar OAuth gateway is disabled.");
 const res=await fetch(url,{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{"Authorization":`Bearer ${process.env.CHESS_CALENDAR_OAUTH_API_KEY!}`,
   "Content-Type":"application/json"},
  body:JSON.stringify(input),signal:AbortSignal.timeout(12000),
 });
 if(!res.ok)throw new Error("Delegated calendar OAuth gateway unavailable.");
 return res.json() as Promise<unknown>;
}
export function validateCalendarOAuthStatus(
 data:unknown,expected:{tenantSlug:string;clerkUserId:string},
 now=new Date(),
){
 const p=status.parse(data);
 const checkedAt=new Date(p.checkedAt);
 if(p.tenantSlug!==expected.tenantSlug||p.clerkUserId!==expected.clerkUserId||
  checkedAt>now||now.getTime()-checkedAt.getTime()>5*60*1000||
  (p.state==="CONNECTED"&&!p.scopes.includes("TASKS")))
  throw new Error("Delegated OAuth provider returned stale/mismatched employee evidence.");
 return p;
}
export async function myDelegatedCalendarStatus(){
 const employee=await actor();
 if(!delegatedCalendarOAuthConfigured())
  return {available:false as const,state:"DISABLED" as const,scopes:[] as string[]};
 const {db,tenantId}=getTenantDb();
 const raw=await post(process.env.CHESS_CALENDAR_OAUTH_STATUS_URL!,{
  tenantSlug:tenantId,clerkUserId:employee.clerkUserId,
 });
 const state=validateCalendarOAuthStatus(raw,{tenantSlug:tenantId,
  clerkUserId:employee.clerkUserId});
 const pref=await db.chessCalendarPreference.findUnique({where:{
  clerkUserId:employee.clerkUserId,
 }});
 return {available:true as const,state:state.state,
  scopes:state.scopes.filter(x=>x==="TASKS"?maySyncCalendar(pref):
   maySyncAppointmentCalendar(pref))};
}
export async function startMyDelegatedCalendarConnection(){
 const employee=await actor();
 if(!delegatedCalendarOAuthConfigured())
  throw new Error("Delegated calendar OAuth gateway disabled.");
 const {db,tenantId}=getTenantDb();
 const pref=await db.chessCalendarPreference.findUnique({where:{
  clerkUserId:employee.clerkUserId,
 }});
 if(!maySyncCalendar(pref))throw new PermissionError("record:update");
 const scopes=["TASKS",
  ...(maySyncAppointmentCalendar(pref)?["APPOINTMENTS"]:[])];
 const nonce=randomUUID();
 const raw=await post(process.env.CHESS_CALENDAR_OAUTH_START_URL!,{
  tenantSlug:tenantId,clerkUserId:employee.clerkUserId,
  scopes,nonce,expiresInSeconds:300,
 });
 const result=startResult.parse(raw);
 const expires=new Date(result.expiresAt).getTime();
 if(result.tenantSlug!==tenantId||result.clerkUserId!==employee.clerkUserId||
  result.nonce!==nonce||expires<=Date.now()||
  expires>Date.now()+5*60*1000)
  throw new Error("OAuth initiation ticket did not match signed-in employee.");
 return {connectUrl:assertGatewayUrl(result.connectUrl),
  expiresAt:result.expiresAt};
}
/** Do not revoke delegated tokens while provider events may still need
 * idempotent cancellation/status checks. No orphaned calendar events. */
export async function disconnectMyDelegatedCalendar(){
 const employee=await actor();
 if(!delegatedCalendarOAuthConfigured())
  throw new Error("Delegated calendar OAuth gateway disabled.");
 const {db,tenantId}=getTenantDb();
 const inFlight=[
  "SYNCED","CANCEL_PENDING","SUBMITTING","UNKNOWN","CANCEL_SUBMITTING",
  "CANCEL_UNKNOWN",
 ] as const;
 const [tasks,appointments]=await Promise.all([
  db.chessCalendarOutbox.count({where:{
   recipientClerkUserId:employee.clerkUserId,status:{in:[...inFlight]},
  }}),
  db.chessAppointmentCalendarOutbox.count({where:{
   recipientClerkUserId:employee.clerkUserId,status:{in:[...inFlight]},
  }}),
 ]);
 if(tasks+appointments>0)
  throw new PermissionError("record:update");
 const raw=await post(process.env.CHESS_CALENDAR_OAUTH_REVOKE_URL!,{
  tenantSlug:tenantId,clerkUserId:employee.clerkUserId,
 });
 const p=revokeResult.parse(raw);
 if(p.tenantSlug!==tenantId||p.clerkUserId!==employee.clerkUserId)
  throw new Error("Delegated revocation did not match employee.");
 await db.chessSecurityEvent.create({data:{
  actorClerkUserId:employee.clerkUserId,
  action:"DELEGATED_CALENDAR_TOKEN_REVOKED",
  resourceType:"ChessCalendarPreference",resourceId:employee.clerkUserId,
  decision:"ALLOW",
 }});
 return {revoked:true as const};
}
