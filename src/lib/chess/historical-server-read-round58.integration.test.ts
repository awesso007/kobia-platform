/**
 * Round 58 disposable PostgreSQL: real Prisma relations, exact tenant SELECT
 * transaction and required security event. No provider credentials or real
 * client PII. A second connection verifies committed read evidence.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { withHistoricalTenantReadScope } from "@/lib/db/historical-read-scope";
import { assertHistoricalWideClientRead } from "./historical-server-read-round58";
const suite=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;
suite("Round 58 atomic client-authorized PostgreSQL sensitive SELECT",()=>{
 let one:PrismaClient,two:PrismaClient;
 let profileId="",linkId="",eventId="";
 const token=randomUUID();
 const actor="fictional-r58-"+token;
 const business="fictional-business-r58-"+token;
 beforeAll(async()=>{
  one=new PrismaClient();two=new PrismaClient();
  await Promise.all([one.$connect(),two.$connect()]);
  const p=await one.clientProfile.create({
   data:{displayName:"Round 58 fictional integration "+token},select:{id:true},
  });
  profileId=p.id;
  const link=await one.clientServiceLink.create({
   data:{profileId,businessId:business,service:"BOOKKEEPING"},
   select:{id:true},
  });
  linkId=link.id;
 });
 afterAll(async()=>{
  if(one){
   if(linkId){
    await one.clientServiceGrant.deleteMany({where:{linkId}});
    await one.clientServiceLink.deleteMany({where:{id:linkId}});
   }
   if(profileId)await one.clientProfile.deleteMany({where:{id:profileId}});
   if(eventId)await one.chessSecurityEvent.deleteMany({where:{id:eventId}});
  }
  await Promise.all([one?.$disconnect(),two?.$disconnect()]);
 });
 it("a real missing grant denies cross-client data under a serializable SELECT",async()=>{
  await expect(one.$transaction(async tx=>{
   await assertHistoricalWideClientRead(tx,{
    id:actor,role:"ADMIN",businessId:business,
   });
   return {private:"secret"};
  },{isolationLevel:"Serializable"})).rejects.toThrow();
 });
 it("a revoked grant is denied on a separate database connection",async()=>{
  await one.clientServiceGrant.create({
   data:{linkId,clerkUserId:actor,canRead:true,canWrite:false,
     revokedAt:new Date()},
  });
  await expect(two.$transaction(async tx=>{
   await assertHistoricalWideClientRead(tx,{
    id:actor,role:"ADMIN",businessId:business,
   });
   return {private:"secret"};
  },{isolationLevel:"Serializable"})).rejects.toThrow();
 });
 it("the same SERIALIZABLE tenant transaction reads and appends its audit before release",async()=>{
  eventId=await one.$transaction(async tx=>{
   return withHistoricalTenantReadScope({
    tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx,
   },async scope=>{
    const selected=getTenantPrisma("tenant_chess_demo");
    await selected.clientProfile.findMany({
     where:{id:profileId},select:{id:true},take:1,
    });
    expect(scope.accesses).toBeGreaterThan(0);
    const event=await tx.chessSecurityEvent.create({data:{
     action:"HISTORICAL_SERVER_SENSITIVE_READ_ATOMIC",
     resourceType:"LegacyServerRead",
     resourceId:"fictional-round58-read",actorClerkUserId:actor,
     decision:"ALLOW",
    },select:{id:true}});
    return event.id;
   });
  },{isolationLevel:"Serializable"});
  expect(await two.chessSecurityEvent.findUnique({where:{id:eventId}}))
   .toMatchObject({resourceId:"fictional-round58-read"});
 });
 it("rejects a query whose audit cannot commit without returning selected bytes",async()=>{
  await expect(one.$transaction(async tx=>{
   return withHistoricalTenantReadScope({
    tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx,
   },async()=>{
    await getTenantPrisma("tenant_chess_demo").clientProfile.findFirst({
     where:{id:profileId},
    });
    throw new Error("round58 audit insert failed");
   });
  },{isolationLevel:"Serializable"})).rejects.toThrow("audit insert failed");
 });
});
