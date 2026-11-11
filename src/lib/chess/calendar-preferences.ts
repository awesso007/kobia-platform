import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";

export function maySyncCalendar(preference:{
 enabled:boolean;acknowledgedAt:Date|null;revokedAt:Date|null;
}|null):boolean {
 return !!preference&&preference.enabled&&!!preference.acknowledgedAt&&!preference.revokedAt;
}
export async function getMyCalendarPreference(){
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const record=await db.chessCalendarPreference.findUnique({
  where:{clerkUserId:actor.clerkUserId},
  select:{enabled:true,acknowledgedAt:true,revokedAt:true},
 });
 return {enabled:maySyncCalendar(record),acknowledgedAt:record?.acknowledgedAt??null};
}
/** Opt-in is personal to the logged-in employee, never an admin delegation.
 * A separate provider-OAuth permission check remains mandatory at the gateway. */
export async function setMyCalendarPreference(input:unknown){
 const data=z.discriminatedUnion("enabled",[
  z.object({enabled:z.literal(true),acknowledge:z.literal(true)}).strict(),
  z.object({enabled:z.literal(false)}).strict(),
 ]).parse(input);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:update");
 const {db}=getTenantDb();
 return db.$transaction(async tx=>{
  const now=new Date();
  const preference=await tx.chessCalendarPreference.upsert({
   where:{clerkUserId:actor.clerkUserId},
   create:{clerkUserId:actor.clerkUserId,enabled:data.enabled,
    acknowledgedAt:data.enabled?now:null,revokedAt:data.enabled?null:now},
   update:{enabled:data.enabled,acknowledgedAt:data.enabled?now:null,
    revokedAt:data.enabled?null:now},
   select:{enabled:true,acknowledgedAt:true,revokedAt:true},
  });
  await tx.chessCalendarOutbox.updateMany({
   where:{recipientClerkUserId:actor.clerkUserId,
    status:data.enabled?"WAITING_CONSENT":"PENDING"},
   data:{status:data.enabled?"PENDING":"WAITING_CONSENT"},
  });
  if(!data.enabled){
   // An already-created remote event must be explicitly deleted. Opt-out
   // forbids all new sends, and queues idempotent cancellation for the gateway.
   await tx.chessCalendarOutbox.updateMany({
    where:{recipientClerkUserId:actor.clerkUserId,status:"SYNCED"},
    data:{status:"CANCEL_PENDING"},
   });
  }
  await tx.chessSecurityEvent.create({data:{
   actorClerkUserId:actor.clerkUserId,
   action:data.enabled?"CALENDAR_OPT_IN":"CALENDAR_OPT_OUT",
   resourceType:"ChessCalendarPreference",resourceId:actor.clerkUserId,
   decision:"ALLOW",
  }});
  return {enabled:maySyncCalendar(preference)};
 });
}
