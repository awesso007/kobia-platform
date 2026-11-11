import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {assertBusinessAccess} from "./business-units";

export const appointmentInput=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128).optional(),
 assignedClerkUserId:z.string().min(1).max(128),
 subject:z.string().trim().min(2).max(180),
 startAt:z.string().datetime(),
 endAt:z.string().datetime(),
}).strict();

export function validAppointmentWindow(startAt:Date,endAt:Date,now=new Date()):boolean {
 const duration=endAt.getTime()-startAt.getTime();
 return Number.isFinite(startAt.getTime()) && Number.isFinite(endAt.getTime()) &&
  duration>=5*60_000 && duration<=4*60*60_000 &&
  startAt.getTime()>now.getTime()-5*60_000 &&
  startAt.getTime()<now.getTime()+365*24*60*60_000;
}

export function isAppointmentConflict(error:unknown):boolean {
 // Prisma P2004 maps database constraints; PostgreSQL exclusion is 23P01.
 if(!error || typeof error!=="object")return false;
 const code=("code" in error && typeof error.code==="string")?error.code:"";
 const message=("message" in error && typeof error.message==="string")?error.message:"";
 return code==="23P01" || code==="P2004" && message.includes("ChessAppointment_no_staff_overlap");
}

export async function createChessAppointment(input:unknown){
 const data=appointmentInput.parse(input);
 const actor=await assertBusinessManager(data.businessId);
 const startAt=new Date(data.startAt);
 const endAt=new Date(data.endAt);
 if(!validAppointmentWindow(startAt,endAt))throw new RangeError("Appointment time is invalid.");
 const {db}=getTenantDb();
 const [membership,assignment]=await Promise.all([
  db.membership.findUnique({where:{clerkUserId:data.assignedClerkUserId},
   select:{status:true,role:true}}),
  db.chessEmployeeAssignment.findUnique({where:{businessId_clerkUserId:{
   businessId:data.businessId,clerkUserId:data.assignedClerkUserId,
  }},select:{revokedAt:true}}),
 ]);
 if(membership?.status!=="ACTIVE"||membership.role==="VIEWER"||
  !assignment||assignment.revokedAt)throw new PermissionError("record:create");
 if(data.clientProfileId){
  const authorizedLink=await db.clientServiceLink.findFirst({where:{
   businessId:data.businessId,profileId:data.clientProfileId,
  },select:{id:true}});
  if(!authorizedLink)throw new PermissionError("record:create");
 }
 return db.$transaction(async tx=>{
  // The PostgreSQL GiST exclusion constraint remains the concurrency
  // authority; app-side checks alone would race.
  const appointment=await tx.chessAppointment.create({data:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   assignedClerkUserId:data.assignedClerkUserId,subject:data.subject,
   startAt,endAt,createdByClerkUserId:actor.clerkUserId,
  },select:{id:true,businessId:true,subject:true,status:true,
   assignedClerkUserId:true,startAt:true,endAt:true,updatedAt:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"APPOINTMENT_CREATED",resourceType:"ChessAppointment",
   resourceId:appointment.id,decision:"ALLOW",
  }});
  await tx.chessEmployeeAlert.create({data:{
   businessId:data.businessId,recipientClerkUserId:data.assignedClerkUserId,
   type:"APPOINTMENT_BOOKED",message:"A CHESS appointment was scheduled for you.",
   dedupeKey:`appointment:${appointment.id}:created`,
  }});
  return appointment;
 });
}

export async function listChessAppointments(businessId:string){
 await assertBusinessManager(businessId);
 const {db}=getTenantDb();
 return db.chessAppointment.findMany({
  where:{businessId},orderBy:{startAt:"asc"},take:100,
  select:{id:true,subject:true,status:true,assignedClerkUserId:true,
   startAt:true,endAt:true,updatedAt:true},
 });
}

const cancelInput=z.object({
 businessId:z.string().min(1).max(128),
 appointmentId:z.string().min(1).max(128),
 expectedUpdatedAt:z.string().datetime(),
}).strict();

export async function cancelChessAppointment(input:unknown){
 const data=cancelInput.parse(input);
 const actor=await assertBusinessManager(data.businessId);
 const version=new Date(data.expectedUpdatedAt);
 const {db}=getTenantDb();
 return db.$transaction(async tx=>{
  const appointment=await tx.chessAppointment.findFirst({
   where:{id:data.appointmentId,businessId:data.businessId,
    status:"SCHEDULED",updatedAt:version},
   select:{assignedClerkUserId:true},
  });
  if(!appointment)return {updated:false};
  const changed=await tx.chessAppointment.updateMany({where:{
   id:data.appointmentId,businessId:data.businessId,
   status:"SCHEDULED",updatedAt:version,
  },data:{status:"CANCELLED",updatedAt:new Date()}});
  if(changed.count!==1)return {updated:false};
  await tx.chessEmployeeAlert.create({data:{
   businessId:data.businessId,recipientClerkUserId:appointment.assignedClerkUserId,
   type:"APPOINTMENT_CANCELLED",message:"A scheduled CHESS appointment was cancelled.",
   dedupeKey:`appointment:${data.appointmentId}:cancelled`,
  }});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"APPOINTMENT_CANCELLED",resourceType:"ChessAppointment",
   resourceId:data.appointmentId,decision:"ALLOW",
  }});
  return {updated:true};
 });
}

export async function listChessAssignableStaff(businessId:string){
 await assertBusinessManager(businessId);
 const {db}=getTenantDb();
 const assignments=await db.chessEmployeeAssignment.findMany({
  where:{businessId,revokedAt:null},
  select:{clerkUserId:true,role:true},
  take:200,
 });
 const members=await db.membership.findMany({where:{
  status:"ACTIVE",role:{not:"VIEWER"},
  clerkUserId:{in:assignments.map(x=>x.clerkUserId)},
 },select:{clerkUserId:true,displayName:true}});
 const names=new Map(members.map(m=>[m.clerkUserId,m.displayName]));
 return assignments.filter(a=>names.has(a.clerkUserId)).map(a=>({
  clerkUserId:a.clerkUserId,
  displayName:names.get(a.clerkUserId)||"Assigned staff member",
  role:a.role,
 }));
}


/** Staff can export only their own appointments, never coworkers' subjects
 * or confidential client-profile links. The calendar emits generic titles. */
export async function listMyChessAppointmentTimes(businessId:string){
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return db.chessAppointment.findMany({
  where:{businessId,assignedClerkUserId:actor.clerkUserId,status:"SCHEDULED"},
  select:{id:true,startAt:true,status:true},
  orderBy:{startAt:"asc"},take:100,
 });
}
