import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";

const integration=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;
integration("CHESS CORP 2 tenant PostgreSQL integration",()=>{
 let db:PrismaClient;
 let profileId="";
 let businessId="";
 let linkId="";
 beforeAll(async()=>{db=new PrismaClient();await db.$connect();});
 afterAll(async()=>{
  if(db){
   if(linkId)await db.clientServiceLink.deleteMany({where:{id:linkId}});
   if(profileId)await db.clientProfile.deleteMany({where:{id:profileId}});
   if(businessId)await db.chessBusinessUnit.deleteMany({where:{id:businessId}});
   await db.$disconnect();
  }
 });
 it("persists tenant scoped business, profile and service grants with FK isolation",async()=>{
  const suffix=Date.now().toString(36);
  const business=await db.chessBusinessUnit.create({data:{slug:"integration-"+suffix,name:"Integration business"}});
  businessId=business.id;
  const profile=await db.clientProfile.create({data:{displayName:"Integration Profile"}});
  profileId=profile.id;
  const link=await db.clientServiceLink.create({data:{
   profileId:profile.id,businessId:business.id,service:"MORTGAGE",
  }});
  linkId=link.id;
  const grant=await db.clientServiceGrant.create({data:{
   linkId:link.id,clerkUserId:"integration-user",canRead:true,canWrite:false,
  }});
  expect(grant.canWrite).toBe(false);
  await db.clientServiceGrant.update({where:{id:grant.id},data:{revokedAt:new Date(),canRead:false}});
  const active=await db.clientServiceGrant.count({where:{
   linkId:link.id,clerkUserId:"integration-user",canRead:true,revokedAt:null,
  }});
  expect(active).toBe(0);
 });
 it("makes security-event rows immutable at the database layer",async()=>{
  const event=await db.chessSecurityEvent.create({data:{
   action:"TEST",resourceType:"INTEGRATION",decision:"ALLOW",
  }});
  await expect(db.chessSecurityEvent.update({where:{id:event.id},data:{
   decision:"DENY",
  }})).rejects.toThrow();
  await expect(db.chessSecurityEvent.delete({where:{id:event.id}})).rejects.toThrow();
 });
 it("persists pinned S3 version metadata without exposing object bytes",async()=>{
  const record=await db.chessClientDocument.create({data:{
   businessId:"integration-unit",clientProfileId:"integration-client",service:"TAX",
   storageKey:"test-version-"+Date.now(),fileName:"example.pdf",
   mimeType:"application/pdf",maxBytes:1024,actualBytes:11,
   storageVersionId:"s3-immutable-version",storageETag:"etag-verified",
   status:"QUARANTINED",uploadedByClerkUserId:"integration-user",
  }});
  const loaded=await db.chessClientDocument.findUnique({where:{id:record.id}});
  expect(loaded?.storageVersionId).toBe("s3-immutable-version");
  expect(loaded?.storageETag).toBe("etag-verified");
  await db.chessClientDocument.delete({where:{id:record.id}});
 });
 it("rejects stale work-item status updates",async()=>{
  const item=await db.chessWorkItem.create({data:{
   businessId:"integration-unit",title:"Test optimistic concurrency",
  }});
  const stale=item.updatedAt;
  const changed=await db.chessWorkItem.updateMany({
   where:{id:item.id,updatedAt:stale,status:"TODO"},
   data:{status:"IN_PROGRESS",updatedAt:new Date(stale.getTime()+1000)},
  });
  expect(changed.count).toBe(1);
  const conflict=await db.chessWorkItem.updateMany({
   where:{id:item.id,updatedAt:stale,status:"TODO"},
   data:{status:"CANCELLED"},
  });
  expect(conflict.count).toBe(0);
  await db.chessWorkItem.delete({where:{id:item.id}});
 });
 it("enforces one task per recurring occurrence and one recipient alert per event",async()=>{
  const business=await db.chessBusinessUnit.create({
   data:{slug:"recurring-test-"+Date.now(),name:"Recurrence integration"},
  });
  try{
   const schedule=await db.chessWorkRecurrence.create({data:{
    businessId:business.id,title:"Monthly financial close",frequency:"MONTHLY",
    interval:1,anchorDay:31,nextRunAt:new Date("2026-12-31T15:00:00.000Z"),
    createdByClerkUserId:"test-manager",
   }});
   const due=new Date("2026-12-31T15:00:00.000Z");
   const task=await db.chessWorkItem.create({data:{
    businessId:business.id,recurrenceId:schedule.id,scheduledFor:due,
    title:"Monthly financial close",dueAt:due,
   }});
   expect(task.recurrenceId).toBe(schedule.id);
   const calendar=await db.chessCalendarOutbox.create({data:{
    businessId:business.id,workItemId:task.id,
    recipientClerkUserId:"integration-user",scheduledFor:due,
    idempotencyKey:"calendar:"+task.id,
   }});
   expect(calendar.status).toBe("PENDING");
   const waiting=await db.chessCalendarOutbox.update({
    where:{id:calendar.id},data:{status:"WAITING_CONSENT"},
   });
   expect(waiting.status).toBe("WAITING_CONSENT");
   await db.chessCalendarOutbox.update({where:{id:calendar.id},data:{status:"PENDING"}});
   await db.chessCalendarOutbox.update({where:{id:calendar.id},data:{status:"SYNCED",providerEventId:"event123"}});
   const cancel=await db.chessCalendarOutbox.update({
    where:{id:calendar.id},data:{status:"CANCEL_PENDING"},
   });
   expect(cancel.status).toBe("CANCEL_PENDING");
   await expect(db.chessCalendarOutbox.create({data:{
    businessId:business.id,workItemId:task.id,
    recipientClerkUserId:"integration-user",scheduledFor:due,
    idempotencyKey:calendar.idempotencyKey,
   }})).rejects.toThrow();
   await expect(db.chessWorkItem.create({data:{
    businessId:business.id,recurrenceId:schedule.id,scheduledFor:due,
    title:"Duplicate attempt",dueAt:due,
   }})).rejects.toThrow();
   const alert=await db.chessEmployeeAlert.create({data:{
    businessId:business.id,recipientClerkUserId:"test-staff",workItemId:task.id,
    type:"WORK_ASSIGNED",message:"New work item",
    dedupeKey:"occurrence:"+task.id,
   }});
   await expect(db.chessEmployeeAlert.create({data:{
    businessId:business.id,recipientClerkUserId:"test-staff",workItemId:task.id,
    type:"WORK_ASSIGNED",message:"Duplicate alert",
    dedupeKey:alert.dedupeKey,
   }})).rejects.toThrow();
   await db.chessEmployeeAlert.delete({where:{id:alert.id}});
   await db.chessCalendarOutbox.delete({where:{id:calendar.id}});
   await db.chessWorkItem.delete({where:{id:task.id}});
   await db.chessWorkRecurrence.delete({where:{id:schedule.id}});
  } finally {
   await db.chessCalendarOutbox.deleteMany({where:{businessId:business.id}});
   await db.chessEmployeeAlert.deleteMany({where:{businessId:business.id}});
   await db.chessWorkItem.deleteMany({where:{businessId:business.id}});
   await db.chessWorkRecurrence.deleteMany({where:{businessId:business.id}});
   await db.chessBusinessUnit.delete({where:{id:business.id}});
  }
 });
 it("persists opt-in and revocation without a provider connection",async()=>{
  const clerkUserId="integration-calendar-"+Date.now();
  const pref=await db.chessCalendarPreference.create({data:{
   clerkUserId,enabled:true,acknowledgedAt:new Date(),
  }});
  try{
   expect(pref.enabled).toBe(true);
   const revoked=await db.chessCalendarPreference.update({
    where:{clerkUserId},data:{enabled:false,revokedAt:new Date()},
   });
   expect(revoked.enabled).toBe(false);
   expect(revoked.revokedAt).not.toBeNull();
  }finally{
   await db.chessCalendarPreference.delete({where:{clerkUserId}});
  }
 });
 it("persists restricted worker run outcome metrics in a tenant schema",async()=>{
  const run=await db.chessWorkerRun.create({data:{
   kind:"RECURRING_WORK",status:"DEGRADED",examined:10,processed:8,blocked:2,
  }});
  try{
   const read=await db.chessWorkerRun.findUnique({where:{id:run.id}});
   expect(read?.kind).toBe("RECURRING_WORK");
   expect(read?.blocked).toBe(2);
  }finally{await db.chessWorkerRun.delete({where:{id:run.id}});}
 });
 it("rejects a service link whose client profile does not exist",async()=>{
  await expect(db.clientServiceLink.create({data:{
   profileId:"missing-profile-id",businessId,service:"TAX",
  }})).rejects.toThrow();
 });
});
