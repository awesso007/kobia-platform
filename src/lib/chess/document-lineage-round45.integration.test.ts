/**
 * Real disposable tenant-Postgres checks for Round 45 lineage triggers.
 * No S3 key is ever used to retrieve or delete bytes in these tests.
 * Metadata is intentionally retained because production DELETE is forbidden.
 */
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";
import {documentDownloadAllowed} from "./documents";

const integration=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;
integration("Round 45 document revision legal retention holds and suppression in PostgreSQL",()=>{
 let db:PrismaClient;
 beforeAll(async()=>{db=new PrismaClient();await db.$connect();});
 afterAll(async()=>{await db?.$disconnect();});
 const fixture=(kind:"ORIGINAL"|"REPLACEMENT"|"REDACTED",id:string,
  parent?:string,revisionNumber=1,status:"READY"|"PENDING"="READY")=>({
  businessId:"fictional-m3-"+id,clientProfileId:"fictional-client-"+id,
  service:"BOOKKEEPING" as const,
  storageKey:"tenants/fictional/"+id+"/"+kind+revisionNumber,
  fileName:"fictional-"+kind+".pdf",mimeType:"application/pdf",
  maxBytes:1024,uploadedByClerkUserId:"fictional-uploader",
  revisionKind:kind,replacesDocumentId:parent??null,revisionNumber,
  status,
 });
 it("copies an existing parent's retention, legal hold and suppression onto a new redacted revision",async()=>{
  const id=randomUUID();
  const root=await db.chessClientDocument.create({data:fixture("ORIGINAL",id)});
  const expires=new Date(Date.now()+365*86400000);
  const hold=new Date(),suppressed=new Date();
  await db.chessClientDocument.update({where:{id:root.id},data:{
   retentionUntil:expires,legalHoldAt:hold,
   legalHoldByClerkUserId:"fictional-counsel",
   suppressedAt:suppressed,suppressedByClerkUserId:"fictional-admin",
  }});
  const child=await db.chessClientDocument.create({data:
   fixture("REDACTED",id,root.id,2,"PENDING")});
  expect(child.retentionUntil?.getTime()).toBe(expires.getTime());
  expect(child.legalHoldAt).toBeTruthy();
  expect(child.legalHoldByClerkUserId).toBe("fictional-counsel");
  expect(child.suppressedAt).toBeTruthy();
  expect(child.suppressedByClerkUserId).toBe("fictional-admin");
  expect(documentDownloadAllowed(child)).toBe(false);
  await expect(db.chessClientDocument.update({where:{id:child.id},data:{
   legalHoldAt:null,legalHoldByClerkUserId:null,
  }})).rejects.toThrow();
  await expect(db.chessClientDocument.update({where:{id:child.id},data:{
   suppressedAt:null,suppressedByClerkUserId:null,
  }})).rejects.toThrow();
  await expect(db.chessClientDocument.delete({where:{id:child.id}}))
   .rejects.toThrow();
 },15000);
 it("propagates later legal holds, retention and suppression through an existing revision chain",async()=>{
  const id=randomUUID();
  const root=await db.chessClientDocument.create({data:fixture("ORIGINAL",id)});
  const child=await db.chessClientDocument.create({data:
   fixture("REPLACEMENT",id,root.id,2)});
  const grandchild=await db.chessClientDocument.create({data:
   fixture("REDACTED",id,child.id,3,"PENDING")});
  const until=new Date(Date.now()+400*86400000);
  const hold=new Date(),suppressed=new Date();
  const updated=await db.chessClientDocument.update({where:{id:root.id},
   data:{retentionUntil:until,legalHoldAt:hold,
    legalHoldByClerkUserId:"independent-counsel",
    suppressedAt:suppressed,suppressedByClerkUserId:"owner-reviewer"}});
  expect(updated.retentionUntil?.getTime()).toBe(until.getTime());
  for(const revision of [child,grandchild]){
   const next=await db.chessClientDocument.findUniqueOrThrow({where:{id:revision.id}});
   expect(next.retentionUntil?.getTime()).toBe(until.getTime());
   expect(next.legalHoldByClerkUserId).toBe("independent-counsel");
   expect(next.suppressedByClerkUserId).toBe("owner-reviewer");
   await expect(db.chessClientDocument.update({where:{id:revision.id},
    data:{retentionUntil:new Date(until.getTime()-86400000)}}))
     .rejects.toThrow();
  }
 },15000);
 it("rejects shortening an existing newer child's independent retention by a later parent policy",async()=>{
  const id=randomUUID();
  const root=await db.chessClientDocument.create({data:fixture("ORIGINAL",id)});
  const child=await db.chessClientDocument.create({data:
   fixture("REPLACEMENT",id,root.id,2,"PENDING")});
  const later=new Date(Date.now()+500*86400000);
  await db.chessClientDocument.update({where:{id:child.id},data:{retentionUntil:later}});
  await expect(db.chessClientDocument.update({where:{id:root.id},
   data:{retentionUntil:new Date(Date.now()+600*86400000)}}))
    .rejects.toThrow();
  expect((await db.chessClientDocument.findUniqueOrThrow({where:{id:root.id}}))
   .retentionUntil).toBeNull();
  expect((await db.chessClientDocument.findUniqueOrThrow({where:{id:child.id}}))
   .retentionUntil?.getTime()).toBe(later.getTime());
 },15000);
});
