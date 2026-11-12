/**
 * Round 50 real PostgreSQL source/audit transaction test.
 * Runs ONLY after CI migrates the disposable fictional demo tenant schema.
 * No production account, live client, external provider or vault key is used.
 */
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";
import {getTenantPrisma} from "@/lib/db/tenant-prisma";
import {withHistoricalTenantReadScope} from "@/lib/db/historical-read-scope";

const run=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;
run("Round 50 audited SELECT and immutable receipt commit together in tenant PostgreSQL",()=>{
 let db:PrismaClient;
 const id="round50-ci-"+randomUUID();
 beforeAll(async()=>{db=new PrismaClient();await db.$connect();});
 afterAll(async()=>{
  if(db){
   // Audit receipts are append-only in the real PostgreSQL schema.
   // Never bypass that invariant for tests; the entire disposable CI
   // database is destroyed with its container after the run.
   await db.membership.deleteMany({where:{clerkUserId:id}});
   await db.$disconnect();
  }
 });
 it("selects membership through the same Prisma transaction as its audit INSERT",async()=>{
  await db.membership.create({data:{clerkUserId:id,role:"MEMBER",status:"ACTIVE"}});
  const selected=await db.$transaction(async tx=>{
   const live=await tx.membership.findUnique({
    where:{clerkUserId:id},select:{status:true,role:true},
   });
   expect(live?.status).toBe("ACTIVE");
   const value=await withHistoricalTenantReadScope({
    tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx,
   },async scope=>{
    const bound=getTenantPrisma("tenant_chess_demo");
    const result=await bound.membership.findUnique({
     where:{clerkUserId:id},select:{clerkUserId:true,status:true},
    });
    expect(scope.accesses).toBeGreaterThan(0);
    expect(()=>getTenantPrisma("tenant_foreign")).toThrow();
    return result;
   });
   await tx.chessSecurityEvent.create({data:{
    actorClerkUserId:id,action:"ROUND50_ATOMIC_SENSITIVE_READ",
    resourceType:"Membership",resourceId:id,decision:"ALLOW",
   }});
   return value;
  },{isolationLevel:"Serializable"});
  expect(selected?.clerkUserId).toBe(id);
  const receipts=await db.chessSecurityEvent.findMany({
   where:{resourceId:id,action:"ROUND50_ATOMIC_SENSITIVE_READ"},
  });
  expect(receipts).toHaveLength(1);
  expect(receipts[0]?.decision).toBe("ALLOW");
 });
 it("revoked actor is denied before fetching selected data",async()=>{
  await db.membership.update({where:{clerkUserId:id},data:{status:"SUSPENDED"}});
  let selected=false;
  const result=await db.$transaction(async tx=>{
   const member=await tx.membership.findUnique({
    where:{clerkUserId:id},select:{status:true},
   });
   if(member?.status==="ACTIVE")selected=true;
   await tx.chessSecurityEvent.create({data:{
    actorClerkUserId:id,action:"ROUND50_ATOMIC_SENSITIVE_READ",
    resourceType:"Membership",resourceId:id,decision:"DENY",
   }});
   return member?.status;
  },{isolationLevel:"Serializable"});
  expect(selected).toBe(false);
  expect(result).toBe("SUSPENDED");
  expect(await db.chessSecurityEvent.count({
   where:{resourceId:id,action:"ROUND50_ATOMIC_SENSITIVE_READ",decision:"DENY"},
  })).toBe(1);
 });
 it("cannot commit a selected payload when audit insertion fails",async()=>{
  const before=await db.chessSecurityEvent.count({
   where:{resourceId:id,action:"ROUND50_ATOMIC_SENSITIVE_READ"},
  });
  let released=false;
  await expect(db.$transaction(async tx=>{
   const row=await withHistoricalTenantReadScope({
    tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx,
   },async()=>{
    return getTenantPrisma("tenant_chess_demo").membership.findUnique({
     where:{clerkUserId:id},select:{clerkUserId:true},
    });
   });
   expect(row?.clerkUserId).toBe(id);
   // This failed audit INSERT must abort the transaction. No response can
   // be returned to the caller after the transaction rejects.
   await tx.chessSecurityEvent.create({data:{
    actorClerkUserId:id,action:null as never,
    resourceType:"Membership",resourceId:id,decision:"ALLOW",
   }});
   released=true;
  },{isolationLevel:"Serializable"})).rejects.toThrow();
  expect(released).toBe(false);
  expect(await db.chessSecurityEvent.count({
   where:{resourceId:id,action:"ROUND50_ATOMIC_SENSITIVE_READ"},
  })).toBe(before);
 });
});
