import {getTenantDb} from "@/lib/db/get-tenant-db";
import {scanChessWorkerPages} from "./worker-pages";

/** Reminder keys are independent of worker retry timing. */
export function appointmentReminderKey(id:string,startAt:Date):string{
 return `appointment:${id}:reminder:${startAt.toISOString()}`;
}

/** Deliver a generic in-app reminder within one hour of a booking.
 * External email/SMS is intentionally not enabled without client/employee
 * notification policy and an approved provider. */
export async function runChessAppointmentReminders(now=new Date()){
 const {db}=getTenantDb();
 const end=new Date(now.getTime()+60*60*1000);
 return scanChessWorkerPages(
 async(after,take)=>db.chessAppointment.findMany({
  where:{status:"SCHEDULED",startAt:{gte:now,lt:end}},
  select:{id:true,businessId:true,assignedClerkUserId:true,startAt:true},
  orderBy:[{startAt:"asc"},{id:"asc"}],take,
  ...(after?{cursor:{id:after},skip:1}:{}),
 }),
 async appointments=>{
  if(!appointments.length)return 0;
 const businessIds=[...new Set(appointments.map(a=>a.businessId))];
 const userIds=[...new Set(appointments.map(a=>a.assignedClerkUserId))];
 const [businesses,assignments,members]=await Promise.all([
  db.chessBusinessUnit.findMany({where:{id:{in:businessIds},status:"ACTIVE"},select:{id:true}}),
  db.chessEmployeeAssignment.findMany({where:{businessId:{in:businessIds},
   clerkUserId:{in:userIds},revokedAt:null},select:{businessId:true,clerkUserId:true}}),
  db.membership.findMany({where:{clerkUserId:{in:userIds},status:"ACTIVE",
   role:{not:"VIEWER"}},select:{clerkUserId:true}}),
 ]);
 const activeBusinesses=new Set(businesses.map(b=>b.id));
 const activeMembers=new Set(members.map(m=>m.clerkUserId));
 const activeAssignments=new Set(assignments.map(a=>a.businessId+"|"+a.clerkUserId));
 const alerts=appointments.filter(a=>activeBusinesses.has(a.businessId)&&
  activeMembers.has(a.assignedClerkUserId)&&
  activeAssignments.has(a.businessId+"|"+a.assignedClerkUserId)).map(a=>({
   businessId:a.businessId,recipientClerkUserId:a.assignedClerkUserId,
   type:"APPOINTMENT_REMINDER",message:"A CHESS appointment begins within one hour.",
   dedupeKey:appointmentReminderKey(a.id,a.startAt),
  }));
 const result=alerts.length?await db.chessEmployeeAlert.createMany({
  data:alerts,skipDuplicates:true,
 }):{count:0};
 return result.count;
 });
}
