/**
 * Round 57 actual disposable tenant PostgreSQL regression. An authorized
 * write and immutable ChessSecurityEvent must commit together. A failing
 * event or switched schema must roll back all mutations, including when
 * accesses use getTenantPrisma inside a transaction-bound handler.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { withHistoricalTenantWriteScope } from "@/lib/db/historical-read-scope";

const integration=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;
integration("Round 57 authenticated API mutation audit rollback",()=>{
 let db:PrismaClient;
 const key="round57-"+randomUUID();
 const other=key+"-rollback";
 beforeAll(async()=>{db=new PrismaClient();await db.$connect()});
 afterAll(async()=>{
  if(db){
   await db.tag.deleteMany({where:{name:{in:[key,other]}}});
   await db.$disconnect();
  }
 });
 it("persists both tenant mutation and actor audit in one serializable commit",async()=>{
  const event=await db.$transaction(async tx=>
   withHistoricalTenantWriteScope({
    tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx,
   },async scope=>{
    const selected=getTenantPrisma("tenant_chess_demo");
    await selected.tag.create({data:{name:key,color:"#000000"}});
    const event=await tx.chessSecurityEvent.create({data:{
     actorClerkUserId:"fictional-round57-actor",
     action:"HISTORICAL_AUTHENTICATED_MUTATION_ATOMIC",
     resourceType:"HistoricalApiMutation",
     resourceId:"POST helpdesk/categories",decision:"ALLOW",
    },select:{id:true}});
    expect(scope.accesses).toBeGreaterThanOrEqual(1);
    return event.id;
   }),{isolationLevel:"Serializable"});
  expect(await db.tag.count({where:{name:key}})).toBe(1);
  expect(await db.chessSecurityEvent.findUnique({where:{id:event}}))
   .toMatchObject({action:"HISTORICAL_AUTHENTICATED_MUTATION_ATOMIC"});
 });
 it("does not commit a mutation after audit insertion fails",async()=>{
  await expect(db.$transaction(async tx=>
   withHistoricalTenantWriteScope({
    tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx,
   },async()=>{
    await getTenantPrisma("tenant_chess_demo").tag.create({
     data:{name:other,color:"#111111"},
    });
    throw new Error("audit database unavailable");
   }),{isolationLevel:"Serializable"})).rejects.toThrow("audit database unavailable");
  expect(await db.tag.count({where:{name:other}})).toBe(0);
 });
 it("rejects selecting another tenant schema during audited writes",async()=>{
  await expect(db.$transaction(async tx=>
   withHistoricalTenantWriteScope({
    tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx,
   },async()=>{
    getTenantPrisma("tenant_other_business");
   }),{isolationLevel:"Serializable"})).rejects.toThrow(
    "Tenant/schema changed during audited read",
   );
 });
});
