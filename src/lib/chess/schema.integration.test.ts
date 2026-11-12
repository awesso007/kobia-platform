import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";
import {claimChessRateWindow,ChessRateLimitError,chessRateSubject,chessRateWindow} from "./api-rate-limit";
import {auditedClientServiceRead} from "@/lib/client-profile/service-access-audit";
import {claimChessAiDailyCall} from "./ai-daily-budget";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";
import {scanChessWorkerPages} from "./worker-pages";

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
 it("audits granted, denied, missing and revoked client-service reads atomically",async()=>{
  const suffix=Date.now().toString(36);
  const business=await db.chessBusinessUnit.create({data:{
   slug:"audited-read-"+suffix,name:"Fictional access-review business",
  }});
  const profile=await db.clientProfile.create({data:{
   displayName:"Fictional access-review client",
  }});
  const link=await db.clientServiceLink.create({data:{
   profileId:profile.id,businessId:business.id,service:"BOOKKEEPING",
  }});
  const actor={
   clerkUserId:"fictional-audit-staff-"+suffix,
   role:"MEMBER" as const,status:"ACTIVE" as const,
  };
  const base={actor,businessId:business.id,profileId:profile.id,
   service:"BOOKKEEPING" as const};
  try{
   const before=await auditedClientServiceRead(db,base);
   expect(before).toEqual({status:"DENIED"});
   const missing=await auditedClientServiceRead(db,{...base,service:"TAX"});
   expect(missing).toEqual({status:"NOT_FOUND"});
   const grant=await db.clientServiceGrant.create({data:{
    linkId:link.id,clerkUserId:actor.clerkUserId,canRead:true,canWrite:false,
   }});
   const allowed=await auditedClientServiceRead(db,base);
   expect(allowed.status).toBe("ALLOWED");
   if(allowed.status==="ALLOWED"){
    expect(allowed.link.id).toBe(link.id);
    expect(allowed.link.businessId).toBe(business.id);
   }
   await db.clientServiceGrant.update({where:{id:grant.id},data:{
    canRead:false,canWrite:false,revokedAt:new Date(),
   }});
   const after=await auditedClientServiceRead(db,base);
   expect(after).toEqual({status:"DENIED"});
   const events=await db.chessSecurityEvent.findMany({
    where:{businessId:business.id,action:"CLIENT_SERVICE_LINK_READ"},
    orderBy:{occurredAt:"asc"},
   });
   expect(events).toHaveLength(4);
   expect(events.filter(e=>e.decision==="ALLOW")).toHaveLength(1);
   expect(events.filter(e=>e.decision==="DENY")).toHaveLength(3);
   expect(events.some(e=>e.resourceId===null&&e.decision==="DENY")).toBe(true);
   expect(events.every(e=>e.actorClerkUserId===actor.clerkUserId)).toBe(true);
   expect(events.every(e=>e.resourceType==="ClientServiceLink")).toBe(true);
   await expect(db.chessSecurityEvent.update({where:{id:events[0]!.id},
    data:{decision:"ALLOW"},
   })).rejects.toThrow();
  }finally{
   await db.clientServiceGrant.deleteMany({where:{linkId:link.id}});
   await db.clientServiceLink.delete({where:{id:link.id}});
   await db.clientProfile.delete({where:{id:profile.id}});
   await db.chessBusinessUnit.delete({where:{id:business.id}});
   // Security-event rows intentionally remain in this fictional CI database;
   // PostgreSQL write-once enforcement prohibits deleting audit evidence.
  }
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
 it("preserves accepted client consent policy and proof with append-only database controls",async()=>{
  const nonce="consent-sec-"+Date.now().toString(36);
  const policyText="Fictional client consent policy: this is a test-only disclosure "+
   "used solely to validate append-only source consent evidence.";
  const base={businessId:nonce,clientProfileId:"fictional-"+nonce,
   purpose:"service:BOOKKEEPING",policyVersion:"test-v1",policyText};
  // Consent evidence is intentionally left in this ephemeral CI database:
  // the append-only retention trigger prohibits deleting audit records.
  await expect(db.chessClientConsent.create({data:{
   ...base,status:"GRANTED",
  }})).rejects.toThrow();
  const consent=await db.chessClientConsent.create({data:base});
  expect(consent.status).toBe("PENDING");
  await expect(db.chessClientConsent.update({where:{id:consent.id},
   data:{policyText:"Tampered with before consent approval"},
  })).rejects.toThrow();
  await expect(db.chessClientConsent.update({where:{id:consent.id},
   data:{status:"GRANTED"},
  })).rejects.toThrow();
  const verified=new Date(Date.now()-1000);
  const granted=await db.chessClientConsent.update({where:{id:consent.id},
   data:{status:"GRANTED",consentedAt:verified,
    acceptedByClerkUserId:"fictional-clerk-verified",
    verifiedEmailDigest:"a".repeat(64),
    acceptanceEvidenceDigest:"b".repeat(64)},
  });
  expect(granted.status).toBe("GRANTED");
  await expect(db.chessClientConsent.update({where:{id:consent.id},
   data:{policyVersion:"forged-v2"},
  })).rejects.toThrow();
  await expect(db.chessClientConsent.update({where:{id:consent.id},
   data:{acceptedByClerkUserId:"forged-user"},
  })).rejects.toThrow();
  await expect(db.chessClientConsent.update({where:{id:consent.id},
   data:{status:"PENDING"},
  })).rejects.toThrow();
  await expect(db.chessClientConsent.delete({where:{id:consent.id}}))
   .rejects.toThrow();
  const revoked=await db.chessClientConsent.update({where:{id:consent.id},
   data:{status:"WITHDRAWN",withdrawnAt:new Date()},
  });
  expect(revoked.status).toBe("WITHDRAWN");
  await expect(db.chessClientConsent.update({where:{id:consent.id},
   data:{status:"GRANTED"},
  })).rejects.toThrow();
  await expect(db.chessClientConsent.delete({where:{id:consent.id}}))
   .rejects.toThrow();
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
  await expect(db.chessClientDocument.delete({where:{id:record.id}}))
   .rejects.toThrow();
  // The protected fictitious record remains, matching the permanent
  // release-hold pending retention/legal deletion workflow.
 });
 it("enforces document retention, immutable legal hold and suppression at PostgreSQL layer",async()=>{
  const row=await db.chessClientDocument.create({data:{
   businessId:"fictional-retention",clientProfileId:"fictional-client",
   service:"BOOKKEEPING",fileName:"fictional.pdf",
   mimeType:"application/pdf",maxBytes:1200,storageKey:"retained-"+Date.now(),
   uploadedByClerkUserId:"fictional-admin",
  }});
  const date=new Date(Date.now()+365*86400000);
  await db.chessClientDocument.update({where:{id:row.id},data:{
   retentionUntil:date,
  }});
  const hold=await db.chessClientDocument.update({where:{id:row.id},data:{
   legalHoldAt:new Date(),legalHoldByClerkUserId:"fictional-counsel",
  }});
  expect(hold.legalHoldAt).not.toBeNull();
  await expect(db.chessClientDocument.update({where:{id:row.id},data:{
   legalHoldAt:null,legalHoldByClerkUserId:null,
  }})).rejects.toThrow();
  await expect(db.chessClientDocument.update({where:{id:row.id},data:{
   retentionUntil:new Date(Date.now()+730*86400000),
  }})).rejects.toThrow();
  await db.chessClientDocument.update({where:{id:row.id},data:{
   suppressedAt:new Date(),suppressedByClerkUserId:"fictional-reviewer",
  }});
  await expect(db.chessClientDocument.update({where:{id:row.id},data:{
   suppressedAt:null,suppressedByClerkUserId:null,
  }})).rejects.toThrow();
  await expect(db.chessClientDocument.delete({where:{id:row.id}}))
   .rejects.toThrow();
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
   expect(pref.appointmentEnabled).toBe(false);
   const separateConsent=await db.chessCalendarPreference.update({
    where:{clerkUserId},
    data:{appointmentEnabled:true,appointmentAcknowledgedAt:new Date()},
   });
   expect(separateConsent.appointmentEnabled).toBe(true);
   const revoked=await db.chessCalendarPreference.update({
    where:{clerkUserId},
    data:{enabled:false,revokedAt:new Date(),
     appointmentEnabled:false,appointmentRevokedAt:new Date()},
   });
   expect(revoked.enabled).toBe(false);
   expect(revoked.appointmentEnabled).toBe(false);
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
 it("persists privacy-limited AI scheduler telemetry",async()=>{
  const run=await db.chessWorkerRun.create({data:{
   kind:"AI_TRIAGE",status:"DEGRADED",examined:25,processed:23,blocked:2,
  }});
  try{
   const found=await db.chessWorkerRun.findUnique({where:{id:run.id}});
   expect(found?.kind).toBe("AI_TRIAGE");
   expect(found?.examined).toBe(25);
   expect(found?.blocked).toBe(2);
  }finally{await db.chessWorkerRun.delete({where:{id:run.id}});}
 });
 it("rejects overlapping staff appointments but permits adjacent slots and rebooking after cancellation",async()=>{
  const suffix=Date.now().toString(36);
  const business=await db.chessBusinessUnit.create({
   data:{slug:"appt-test-"+suffix,name:"Appointment test workspace"},
  });
  const otherBusiness=await db.chessBusinessUnit.create({
   data:{slug:"appt-other-"+suffix,name:"Second appointment workspace"},
  });
  try{
   const common={businessId:business.id,assignedClerkUserId:"integration-employee",
    subject:"Integration test",createdByClerkUserId:"integration-manager"};
   const start=new Date("2026-12-03T17:00:00.000Z");
   const end=new Date("2026-12-03T18:00:00.000Z");
   const first=await db.chessAppointment.create({data:{...common,startAt:start,endAt:end}});
   const queue=await db.chessAppointmentCalendarOutbox.create({data:{
    businessId:business.id,appointmentId:first.id,
    recipientClerkUserId:common.assignedClerkUserId,startsAt:start,endsAt:end,
    idempotencyKey:"appointment-calendar:"+first.id,
   }});
   expect(queue.status).toBe("WAITING_CONSENT");
   await expect(db.chessAppointmentCalendarOutbox.create({data:{
    businessId:business.id,appointmentId:first.id,
    recipientClerkUserId:common.assignedClerkUserId,startsAt:start,endsAt:end,
    idempotencyKey:"duplicate:"+first.id,
   }})).rejects.toThrow();
   await db.chessAppointmentCalendarOutbox.update({
    where:{id:queue.id},data:{status:"PENDING"},
   });
   await db.chessAppointmentCalendarOutbox.update({
    where:{id:queue.id},data:{status:"SYNCED",providerEventId:"sandbox-event"},
   });
   const cancelQueue=await db.chessAppointmentCalendarOutbox.update({
    where:{id:queue.id},data:{status:"CANCEL_PENDING"},
   });
   expect(cancelQueue.providerEventId).toBe("sandbox-event");
   // No sensitive details cross businesses, but the same employee cannot
   // be scheduled by two CHESS business units at once within this tenant.
   await expect(db.chessAppointment.create({data:{
    ...common,businessId:otherBusiness.id,startAt:start,endAt:end,
   }})).rejects.toThrow();
   await expect(db.chessAppointment.create({data:{
    ...common,startAt:new Date("2026-12-03T17:30:00.000Z"),
    endAt:new Date("2026-12-03T18:30:00.000Z"),
   }})).rejects.toThrow();
   const adjacent=await db.chessAppointment.create({data:{
    ...common,startAt:end,endAt:new Date("2026-12-03T19:00:00.000Z"),
   }});
   expect(adjacent.id).toBeTruthy();
   await db.chessAppointment.update({where:{id:first.id},data:{status:"CANCELLED"}});
   const rebook=await db.chessAppointment.create({data:{
    ...common,startAt:start,endAt:new Date("2026-12-03T17:30:00.000Z"),
   }});
   expect(rebook.status).toBe("SCHEDULED");
  }finally{
   await db.chessAppointmentCalendarOutbox.deleteMany({where:{businessId:{in:[business.id,otherBusiness.id]}}});
   await db.chessAppointment.deleteMany({where:{businessId:{in:[business.id,otherBusiness.id]}}});
   await db.chessBusinessUnit.deleteMany({where:{id:{in:[business.id,otherBusiness.id]}}});
  }
 });
 it("enforces idempotent bank reviews, tax evidence versions and payroll reporting states",async()=>{
  const ref="m5-"+Date.now().toString(36);
  const work=await db.chessBankReview.create({data:{
   businessId:ref,clientProfileId:ref,serviceCaseId:ref,
   legacyTenantId:ref,legacyEntityId:ref,
   legacyBankTransactionId:ref,transactionDigest:"a".repeat(64),
   createdByClerkUserId:"first-reviewer",
  }});
  try{
   expect(work.status).toBe("PENDING");
   await expect(db.chessBankReview.create({data:{
    businessId:ref,clientProfileId:ref,serviceCaseId:ref,
    legacyTenantId:ref,legacyEntityId:ref,legacyBankTransactionId:ref,
    transactionDigest:"b".repeat(64),createdByClerkUserId:"second-reviewer",
   }})).rejects.toThrow();
   const approved=await db.chessBankReview.updateMany({where:{
    id:work.id,status:"PENDING",updatedAt:work.updatedAt,
   },data:{status:"APPROVED",approvedAccountId:"offset-ledger-account",
    reviewedByClerkUserId:"second-reviewer",reviewedAt:new Date()}});
   expect(approved.count).toBe(1);
   const replay=await db.chessBankReview.updateMany({where:{
    id:work.id,status:"PENDING",updatedAt:work.updatedAt,
   },data:{status:"REJECTED"}});
   expect(replay.count).toBe(0);
  }finally{await db.chessBankReview.delete({where:{id:work.id}});}
  const yearStart=new Date("2026-01-01T00:00:00Z");
  const yearEnd=new Date("2027-01-01T00:00:00Z");
  const tax=await db.chessTaxWorkpaper.create({data:{
   businessId:ref,clientProfileId:ref,serviceCaseId:ref,
   legacyTenantId:ref,legacyEntityId:ref,taxYear:2026,
   startAt:yearStart,endAt:yearEnd,snapshotDigest:"c".repeat(64),
   sourceEntryCount:8,createdByClerkUserId:"tax-preparer",
  }});
  try{
   await expect(db.chessTaxWorkpaper.create({data:{
    businessId:ref,clientProfileId:ref,serviceCaseId:ref,
    legacyTenantId:ref,legacyEntityId:ref,taxYear:2026,
    startAt:yearStart,endAt:yearEnd,snapshotDigest:"c".repeat(64),
    sourceEntryCount:8,createdByClerkUserId:"tax-preparer",
   }})).rejects.toThrow();
   const reviewed=await db.chessTaxWorkpaper.update({
    where:{id:tax.id},data:{status:"REVIEWED",
     reviewedByClerkUserId:"independent-reviewer",reviewedAt:new Date()},
   });
   expect(reviewed.status).toBe("REVIEWED");
  }finally{await db.chessTaxWorkpaper.delete({where:{id:tax.id}});}
  const dispatch=await db.chessPayrollDispatch.create({data:{
   businessId:ref,clientProfileId:ref,legacyTenantId:ref,
   legacyEntityId:ref,legacyPayRunId:ref,approvalId:ref,
   idempotencyKey:"payroll-"+ref,status:"SUBMITTED",
  }});
  try{
   const providerReported=await db.chessPayrollDispatch.update({
    where:{id:dispatch.id},data:{status:"PROVIDER_PAID",providerCheckedAt:new Date()},
   });
   expect(providerReported.status).toBe("PROVIDER_PAID");
   expect(providerReported.providerCheckedAt).not.toBeNull();
  }finally{await db.chessPayrollDispatch.delete({where:{id:dispatch.id}});}
 });
 it("stores a bank provider reference without credentials and tracks import attempts",async()=>{
  const base="bankfeed-"+Date.now().toString(36);
  const conn=await db.chessBankFeedConnection.create({data:{
   businessId:base,clientProfileId:base,serviceCaseId:base,
   legacyTenantId:base,legacyEntityId:base,legacyBankAccountId:base,
   providerAccountRef:"opaque_provider_account",
   createdByClerkUserId:"operator",
  }});
  try{
   expect(conn.active).toBe(false);
   await expect(db.chessBankFeedConnection.create({data:{
    businessId:base,clientProfileId:base,serviceCaseId:base,
    legacyTenantId:base,legacyEntityId:base,legacyBankAccountId:base,
    providerAccountRef:"different_ref",createdByClerkUserId:"operator",
   }})).rejects.toThrow();
   const run=await db.chessBankFeedSyncRun.create({data:{
    businessId:base,connectionId:conn.id,initiatedByClerkUserId:"operator",
    requestedStartAt:new Date("2026-11-01T00:00:00.000Z"),
   }});
   try{
    expect(run.status).toBe("STARTED");
    const updated=await db.chessBankFeedSyncRun.update({where:{id:run.id},
     data:{status:"COMPLETED",fetchedCount:4,insertedCount:3}});
    expect(updated.insertedCount).toBe(3);
    await expect(db.chessBankFeedSyncRun.update({where:{id:run.id},
     data:{fetchedCount:2,insertedCount:3}})).rejects.toThrow();
   }finally{await db.chessBankFeedSyncRun.delete({where:{id:run.id}});}
  }finally{await db.chessBankFeedConnection.delete({where:{id:conn.id}});}
 });
 it("isolates regulated professional affiliations and uniquely keyed workflows in PostgreSQL",async()=>{
  const suffix=Date.now().toString(36);
  const business="m6-business-"+suffix;
  const caseId="m6-case-"+suffix;
  const professional="staff-"+suffix;
  const affiliation=await db.chessRegulatedAffiliation.create({data:{
   businessId:business,clerkUserId:professional,
   service:"MORTGAGE",jurisdiction:"CA",
   practitionerRegistryId:"TEST-INDIVIDUAL",firmRegistryId:"TEST-FIRM",
  }});
  try{
   expect(affiliation.status).toBe("UNVERIFIED");
   await expect(db.chessRegulatedAffiliation.create({data:{
    businessId:business,clerkUserId:professional,
    service:"MORTGAGE",jurisdiction:"CA",
    practitionerRegistryId:"OTHER",firmRegistryId:"OTHER",
   }})).rejects.toThrow();
   const workflow=await db.chessRegulatedWorkflow.create({data:{
    businessId:business,clientProfileId:"fictional-client",
    serviceCaseId:caseId,service:"MORTGAGE",
    kind:"MORTGAGE_DOCUMENT_INTAKE",requestKey:"request-"+suffix,
    idempotencyKey:"m6-idempotency-"+suffix,
    createdByClerkUserId:professional,
   }});
   try{
    expect(workflow.status).toBe("DRAFT");
    const item=await db.chessRegulatedChecklistItem.create({data:{
     workflowId:workflow.id,itemKey:"CLIENT_SCOPE_DISCLOSED",
    }});
    await expect(db.chessRegulatedChecklistItem.create({data:{
     workflowId:workflow.id,itemKey:"CLIENT_SCOPE_DISCLOSED",
    }})).rejects.toThrow();
    await expect(db.chessRegulatedWorkflow.create({data:{
     businessId:business,clientProfileId:"fictional-client",serviceCaseId:caseId,
     service:"MORTGAGE",kind:"MORTGAGE_DOCUMENT_INTAKE",
     requestKey:"request-"+suffix,idempotencyKey:"m6-different-"+suffix,
     createdByClerkUserId:professional,
    }})).rejects.toThrow();
    const reviewed=await db.chessRegulatedWorkflow.updateMany({where:{
     id:workflow.id,status:"DRAFT",updatedAt:workflow.updatedAt,
    },data:{status:"REVIEW",reviewedByClerkUserId:"independent-reviewer",
     reviewedAt:new Date()}});
    expect(reviewed.count).toBe(1);
    const stale=await db.chessRegulatedWorkflow.updateMany({where:{
     id:workflow.id,status:"DRAFT",updatedAt:workflow.updatedAt,
    },data:{status:"APPROVED"}});
    expect(stale.count).toBe(0);
    await db.chessRegulatedChecklistItem.delete({where:{id:item.id}});
   }finally{
    await db.chessRegulatedChecklistItem.deleteMany({where:{workflowId:workflow.id}});
    await db.chessRegulatedWorkflow.delete({where:{id:workflow.id}});
   }
  }finally{await db.chessRegulatedAffiliation.delete({where:{id:affiliation.id}});}
 });
 it("enforces M7 AI source uniqueness and immutable invoice billing guards",async()=>{
  const suffix=Date.now().toString(36);
  const business="m7-"+suffix;
  const task="task-"+suffix;
  const evidence="e".repeat(64);
  const suggestion=await db.chessAiSuggestion.create({data:{
   businessId:business,workItemId:task,sourceDigest:evidence,
   priority:"NORMAL",recommendation:"REVIEW_DEADLINE",
   rationaleCode:"DEADLINE_SOON",modelVersion:"sandbox_model_v1",
   requestedByClerkUserId:"creator",
  }});
  try{
   expect(suggestion.status).toBe("PENDING");
   await expect(db.chessAiSuggestion.create({data:{
    businessId:business,workItemId:task,sourceDigest:evidence,
    priority:"HIGH",recommendation:"ESCALATE_TO_MANAGER",
    rationaleCode:"TASK_BLOCKED",modelVersion:"sandbox_model_v1",
    requestedByClerkUserId:"other",
   }})).rejects.toThrow();
   const once=await db.chessAiSuggestion.updateMany({where:{
    id:suggestion.id,status:"PENDING",updatedAt:suggestion.updatedAt,
   },data:{status:"ACCEPTED",reviewedByClerkUserId:"different-human",
    reviewedAt:new Date()}});
   expect(once.count).toBe(1);
   const replay=await db.chessAiSuggestion.updateMany({where:{
    id:suggestion.id,status:"PENDING",updatedAt:suggestion.updatedAt,
   },data:{status:"REJECTED"}});
   expect(replay.count).toBe(0);
   await expect(db.chessAiSuggestion.update({where:{id:suggestion.id},
    data:{appliedAt:new Date(),status:"REJECTED",followupWorkItemId:"synthetic-task"},
   })).rejects.toThrow();
   const applied=await db.chessAiSuggestion.update({where:{id:suggestion.id},
    data:{appliedAt:new Date(),followupWorkItemId:"synthetic-task"},
   });
   expect(applied.status).toBe("ACCEPTED");
   expect(applied.followupWorkItemId).toBe("synthetic-task");
  }finally{await db.chessAiSuggestion.delete({where:{id:suggestion.id}});}
  const invoice=await db.chessBillingInvoice.create({data:{
   businessId:business,clientProfileId:"fictional-client",
   serviceCaseId:"case-"+suffix,service:"BOOKKEEPING",
   requestKey:"m7-request-"+suffix,descriptionCode:"BOOKKEEPING_MONTHLY",
   amountCents:19000n,sourceDigest:"a".repeat(64),
   idempotencyKey:"b".repeat(64),createdByClerkUserId:"creator",
  }});
  try{
   expect(invoice.status).toBe("DRAFT");
   expect(invoice.amountCents).toBe(19000n);
   await expect(db.chessBillingInvoice.create({data:{
    businessId:business,clientProfileId:"fictional-client",
    serviceCaseId:"case-"+suffix,service:"BOOKKEEPING",
    requestKey:"m7-request-"+suffix,descriptionCode:"BOOKKEEPING_MONTHLY",
    amountCents:19000n,sourceDigest:"a".repeat(64),
    idempotencyKey:"c".repeat(64),createdByClerkUserId:"another",
   }})).rejects.toThrow();
   await expect(db.chessBillingInvoice.update({where:{id:invoice.id},
    data:{amountCents:-10n}})).rejects.toThrow();
   await expect(db.chessBillingInvoice.update({where:{id:invoice.id},
    data:{currency:"EUR"}})).rejects.toThrow();
   const approved=await db.chessBillingInvoice.updateMany({where:{
    id:invoice.id,status:"DRAFT",updatedAt:invoice.updatedAt,
   },data:{status:"APPROVED",approvedByClerkUserId:"reviewer",
    approvedAt:new Date()}});
   expect(approved.count).toBe(1);
   const again=await db.chessBillingInvoice.updateMany({where:{
    id:invoice.id,status:"DRAFT",updatedAt:invoice.updatedAt,
   },data:{status:"APPROVED"}});
   expect(again.count).toBe(0);
  }finally{await db.chessBillingInvoice.delete({where:{id:invoice.id}});}
 });
 it("allows an unsent invoice to be voided once, without a provider reference",async()=>{
  const invoice=await db.chessBillingInvoice.create({data:{
   businessId:"m7-void-test",clientProfileId:"fictional-client",
   serviceCaseId:"void-case-"+Date.now(),service:"ACCOUNTING",
   requestKey:"void-request-"+Date.now(),descriptionCode:"ACCOUNTING_MONTHLY",
   amountCents:2000n,sourceDigest:"f".repeat(64),idempotencyKey:
    "void-"+Date.now()+"-".repeat(46),
   createdByClerkUserId:"creator",
  }});
  try{
   const first=await db.chessBillingInvoice.updateMany({where:{
    id:invoice.id,status:"DRAFT",updatedAt:invoice.updatedAt,
    providerInvoiceId:null,sentAt:null,sentByClerkUserId:null,
   },data:{status:"VOID",lastErrorCode:"CLIENT_REQUEST"}});
   expect(first.count).toBe(1);
   const replay=await db.chessBillingInvoice.updateMany({where:{
    id:invoice.id,status:"DRAFT",updatedAt:invoice.updatedAt,
   },data:{status:"VOID"}});
   expect(replay.count).toBe(0);
   const fetched=await db.chessBillingInvoice.findUnique({where:{id:invoice.id}});
   expect(fetched?.status).toBe("VOID");
   expect(fetched?.providerInvoiceId).toBeNull();
  }finally{await db.chessBillingInvoice.delete({where:{id:invoice.id}});}
 });
 it("records merchant observations without rewriting invoice or settlement status",async()=>{
  const invoice=await db.chessBillingInvoice.create({data:{
   businessId:"fictional-merchant",clientProfileId:"fictional-client",
   serviceCaseId:"fictional-case-"+Date.now(),
   service:"BOOKKEEPING",descriptionCode:"BOOKKEEPING_MONTHLY",
   amountCents:25000n,requestKey:"fictional_request_merchant",
   sourceDigest:"f".repeat(64),idempotencyKey:"d".repeat(64),
   createdByClerkUserId:"fictional-reviewer",status:"SENT",
   providerInvoiceId:"remote-invoice-test",
  }});
  try{
   const receipt=await db.chessMerchantPaymentEvent.create({data:{
    businessId:invoice.businessId,invoiceId:invoice.id,
    providerInvoiceId:"remote-invoice-test",providerEventId:"evt_"+Date.now(),
    eventKind:"PAYMENT_CAPTURED",amountCents:12000n,
    eventDigest:"a".repeat(64),occurredAt:new Date(),
   }});
   expect(receipt.status).toBe("OBSERVED");
   await expect(db.chessMerchantPaymentEvent.create({data:{
    businessId:invoice.businessId,invoiceId:invoice.id,
    providerInvoiceId:"remote-invoice-test",
    providerEventId:receipt.providerEventId,eventKind:"REFUND_OBSERVED",
    amountCents:500n,eventDigest:"b".repeat(64),occurredAt:new Date(),
   }})).rejects.toThrow();
   await expect(db.chessMerchantPaymentEvent.update({where:{id:receipt.id},
    data:{status:"SETTLED"},
   })).rejects.toThrow();
   await expect(db.chessMerchantPaymentEvent.delete({where:{id:receipt.id}}))
    .rejects.toThrow();
   const unchanged=await db.chessBillingInvoice.findUnique({where:{id:invoice.id}});
   expect(unchanged?.status).toBe("SENT");
  }finally{
   await db.chessBillingInvoice.delete({where:{id:invoice.id}});
  }
 });
 it("reserves independent business AI daily budget slots atomically",async()=>{
  const business="fictional-ai-budget-"+Date.now();
  const day=new Date("2026-11-11T01:00:00.000Z");
  try{
   const first=await claimChessAiDailyCall(db,business,day,2);
   expect(first.callCount).toBe(1);
   const second=await claimChessAiDailyCall(db,business,day,2);
   expect(second.callCount).toBe(2);
   await expect(claimChessAiDailyCall(db,business,day,2)).rejects.toThrow();
   const next=await claimChessAiDailyCall(db,business,
    new Date("2026-11-12T01:00:00.000Z"),2);
   expect(next.callCount).toBe(1);
  }finally{
   await db.chessAiUsageDaily.deleteMany({where:{businessId:business}});
  }
 });
 it("requires separately approved subscription schedule and immutable scope",async()=>{
  const ref="fictional_sub_"+Date.now();
  const start=new Date("2027-01-01T00:00:00.000Z");
  const record=await db.chessBillingSubscriptionPlan.create({data:{
   businessId:"fictional-plan-business",clientProfileId:"fictional-client",
   serviceCaseId:ref,service:"BOOKKEEPING",
   descriptionCode:"BOOKKEEPING_MONTHLY",amountCents:10000n,
   nextDraftAt:start,createdByClerkUserId:"fictional-creator",
  }});
  expect(record.status).toBe("PENDING");
  await expect(db.chessBillingSubscriptionPlan.update({where:{id:record.id},
   data:{status:"ACTIVE",approvedByClerkUserId:"fictional-creator",
    approvedAt:new Date()},
  })).rejects.toThrow();
  await db.chessBillingSubscriptionPlan.update({where:{id:record.id},data:{
   status:"ACTIVE",approvedByClerkUserId:"fictional-reviewer",
   approvedAt:new Date(),
  }});
  const advanced=await db.chessBillingSubscriptionPlan.update({
   where:{id:record.id},data:{
    nextDraftAt:new Date("2027-02-01T00:00:00.000Z"),
    lastDraftAt:start,
   }});
  expect(advanced.lastDraftAt?.toISOString()).toBe(start.toISOString());
  await expect(db.chessBillingSubscriptionPlan.update({
   where:{id:record.id},data:{amountCents:20000n},
  })).rejects.toThrow();
  await expect(db.chessBillingSubscriptionPlan.delete({where:{id:record.id}}))
   .rejects.toThrow();
 });
 it("freezes month-end operational evidence and enforces distinct review and immutability",async()=>{
  const snapshot=await db.chessOperationalPeriodSnapshot.create({data:{
   businessId:"fictional-snapshot-"+Date.now().toString(36),
   month:"2026-10",reportJson:JSON.stringify({
    purpose:"OPERATIONS_ONLY",caseCounts:2,
    excludes:"revenue, cash, settlements, tax, consolidation",
   }),
   sourceDigest:"a".repeat(64),createdByClerkUserId:"fictional-author",
  }});
  expect(snapshot.status).toBe("PENDING");
  await expect(db.chessOperationalPeriodSnapshot.update({where:{id:snapshot.id},
   data:{status:"APPROVED",reviewedByClerkUserId:"fictional-author",
    reviewedAt:new Date()},
  })).rejects.toThrow();
  const reviewed=await db.chessOperationalPeriodSnapshot.update({where:{id:snapshot.id},
   data:{status:"APPROVED",reviewedByClerkUserId:"fictional-independent-reviewer",
    reviewedAt:new Date()},
  });
  expect(reviewed.status).toBe("APPROVED");
  await expect(db.chessOperationalPeriodSnapshot.update({where:{id:snapshot.id},
   data:{sourceDigest:"b".repeat(64)},
  })).rejects.toThrow();
  await expect(db.chessOperationalPeriodSnapshot.update({where:{id:snapshot.id},
   data:{status:"PENDING",reviewedAt:null,reviewedByClerkUserId:null},
  })).rejects.toThrow();
  await expect(db.chessOperationalPeriodSnapshot.delete({where:{id:snapshot.id}}))
   .rejects.toThrow();
 });
 it("enforces one verified archive delivery receipt per immutable security event",async()=>{
  const event=await db.chessSecurityEvent.create({data:{
   action:"TEST_ARCHIVE_EXPORT",resourceType:"INTEGRATION",
   decision:"ALLOW",
  }});
  const outbox=await db.chessAuditArchiveOutbox.create({data:{
   eventId:event.id,digest:"a".repeat(64),
  }});
  expect(outbox.status).toBe("PENDING");
  await expect(db.chessAuditArchiveOutbox.create({data:{
   eventId:event.id,digest:"b".repeat(64),
  }})).rejects.toThrow();
  await expect(db.chessAuditArchiveOutbox.create({data:{
   eventId:"missing-event-id",digest:"f".repeat(64),
  }})).rejects.toThrow();
  await expect(db.chessAuditArchiveOutbox.update({where:{id:outbox.id},
   data:{status:"ARCHIVED"},
  })).rejects.toThrow();
  const archived=await db.chessAuditArchiveOutbox.update({where:{
   id:outbox.id,
  },data:{status:"ARCHIVED",receiptId:"provider-receipt-sandbox",
   archivedAt:new Date()}});
  expect(archived.status).toBe("ARCHIVED");
  await expect(db.chessAuditArchiveOutbox.update({where:{id:outbox.id},
   data:{receiptId:"modified-receipt"},
  })).rejects.toThrow();
  await expect(db.chessAuditArchiveOutbox.delete({
   where:{id:outbox.id},
  })).rejects.toThrow();
 });
 it("increments tenant and user quotas atomically, with no partial excess writes",async()=>{
  const user="rate-integration-"+Date.now();
  const tenant="ci-tenant";
  const now=new Date("2026-11-11T08:35:14.000Z");
  const windowStart=chessRateWindow(now);
  const subjectDigest=chessRateSubject("user",tenant,user);
  const tenantDigest=chessRateSubject("tenant",tenant,tenant);
  try{
   for(let i=0;i<6;i++)
    await claimChessRateWindow(db,"billing_delivery",tenant,user,now);
   await expect(claimChessRateWindow(db,"billing_delivery",tenant,user,now))
    .rejects.toBeInstanceOf(ChessRateLimitError);
   const rows=await db.chessRequestRateWindow.findMany({where:{
    scope:"billing_delivery",windowStart,
    subjectDigest:{in:[subjectDigest,tenantDigest]},
   }});
   expect(rows).toHaveLength(2);
   expect(rows.every(x=>x.hits===6)).toBe(true);
  }finally{
   await db.chessRequestRateWindow.deleteMany({where:{
    scope:"billing_delivery",windowStart,
    subjectDigest:{in:[subjectDigest,tenantDigest]},
   }});
  }
 });
 it("rejects a service link whose client profile does not exist",async()=>{
  await expect(db.clientServiceLink.create({data:{
   profileId:"missing-profile-id",businessId,service:"TAX",
  }})).rejects.toThrow();
 });

 it("commits scoped sensitive read decisions atomically and refuses tampering",async()=>{
  const name="audited-sensitive-"+Date.now().toString(36);
  const unit=await db.chessBusinessUnit.create({data:{
   slug:name,name:"Fictional sensitive workflow unit",
  }});
  const context={
   businessId:unit.id,actorClerkUserId:"fictional-audit-signer",
   action:"REGULATED_WORKFLOW_READ" as const,
   resourceType:"ChessServiceCase" as const,resourceId:"fictional-case",
  };
  try{
   const result=await auditedChessSensitiveRead(db,context,
    async tx=>tx.chessBusinessUnit.findUnique({where:{id:unit.id},
     select:{id:true}}));
   expect(result).toEqual({id:unit.id});
   await expect(auditedChessSensitiveRead(db,context,async()=>null)).rejects.toThrow();
   const rows=await db.chessSecurityEvent.findMany({where:{
    businessId:unit.id,action:"REGULATED_WORKFLOW_READ",
    resourceId:"fictional-case",
   },orderBy:{occurredAt:"asc"}});
   expect(rows.map(r=>r.decision).sort()).toEqual(["ALLOW","DENY"]);
   await expect(db.chessSecurityEvent.update({where:{id:rows[0]!.id},
    data:{decision:"ERROR"}})).rejects.toThrow();
  }finally{
   await db.chessBusinessUnit.delete({where:{id:unit.id}});
  }
 });
 it("allows one source-bound payroll approval per business and digest, not duplicated concurrent submissions",async()=>{
  const digest="a".repeat(64),businessId="fictional-payroll-"+Date.now().toString(36);
  const data={businessId,actionType:"PAYROLL_EXECUTE",payloadDigest:digest,
   requestedBy:"fictional-requester"};
  try{
   const attempts=await Promise.allSettled([
    db.chessActionApproval.create({data}),
    db.chessActionApproval.create({data}),
   ]);
   expect(attempts.filter(x=>x.status==="fulfilled")).toHaveLength(1);
   expect(attempts.filter(x=>x.status==="rejected")).toHaveLength(1);
   expect(await db.chessActionApproval.count({where:{
    businessId,actionType:"PAYROLL_EXECUTE",payloadDigest:digest,
   }})).toBe(1);
   await db.chessActionApproval.create({data:{
    ...data,actionType:"INTERNAL_PROCESS_REVIEW",
   }});
   await db.chessActionApproval.create({data:{
    ...data,actionType:"INTERNAL_PROCESS_REVIEW",
   }});
   expect(await db.chessActionApproval.count({where:{
    businessId,actionType:"INTERNAL_PROCESS_REVIEW",
   }})).toBe(2);
  }finally{
   await db.chessActionApproval.deleteMany({where:{businessId}});
  }
 });

 it("scans more than 200 eligible appointments in stable cursor order without missing a staff reminder",async()=>{
  const suffix=Date.now().toString(36);
  const unit=await db.chessBusinessUnit.create({data:{
   slug:"appointment-page-"+suffix,name:"Fictional paginated calendar unit",
  }});
  const start=new Date("2026-12-05T12:00:00Z");
  try{
   await db.chessAppointment.createMany({data:Array.from({length:241},(_,i)=>({
    businessId:unit.id,subject:"Synthetic reminder appointment",
    assignedClerkUserId:"fictional-employee-"+i,
    createdByClerkUserId:"fictional-calendar-owner",
    startAt:new Date(start.getTime()+((i%59)+1)*60_000),
    endAt:new Date(start.getTime()+((i%59)+2)*60_000),
   }))});
   await db.chessAppointment.create({data:{
    businessId:unit.id,subject:"Cancelled synthetic appointment",
    assignedClerkUserId:"fictional-employee",
    createdByClerkUserId:"fictional-calendar-owner",
    status:"CANCELLED",
    startAt:new Date(start.getTime()+15*60_000),
    endAt:new Date(start.getTime()+16*60_000),
   }});
   const seen:string[]=[];
   const load=async(afterId:string|null,take:number)=>db.chessAppointment.findMany({
    where:{businessId:unit.id,status:"SCHEDULED",
     startAt:{gte:start,lt:new Date(start.getTime()+60*60_000)}},
    select:{id:true},
    orderBy:[{startAt:"asc"},{id:"asc"}],take,
    ...(afterId?{cursor:{id:afterId},skip:1}:{}),
   });
   const result=await scanChessWorkerPages(load,async rows=>{
    seen.push(...rows.map(row=>row.id));return rows.length;
   },{pageSize:75,maxPages:8});
   expect(result).toEqual({examined:241,inserted:241,backlog:false});
   expect(new Set(seen).size).toBe(241);
   const bounded=await scanChessWorkerPages(load,async rows=>rows.length,{
    pageSize:75,maxPages:2,
   });
   expect(bounded).toEqual({examined:150,inserted:150,backlog:true});
  }finally{
   await db.chessAppointment.deleteMany({where:{businessId:unit.id}});
   await db.chessBusinessUnit.delete({where:{id:unit.id}});
  }
 });

});
