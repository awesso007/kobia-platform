import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";
import {PrismaClient as PlatformClient} from "@/lib/db/generated/platform";
import {registerChessDemoTenant,setupAndVerifyChessDemoFixtures} from "./demo-setup-core";
import {assertIsolatedChessDemoDatabase} from "./demo-target-policy";

const integration=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;

integration("CHESS fictional demo seed on isolated PostgreSQL",()=>{
 let db:PrismaClient;
 let platform:PlatformClient;
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL?.includes("chess_demo_ci"))
   throw new Error("Demo integration test requires disposable chess_demo_ci DB.");
  const url=new URL(process.env.DATABASE_URL);
  url.searchParams.set("schema","public");
  platform=new PlatformClient({datasources:{db:{url:url.toString()}}});
  db=new PrismaClient();
  await Promise.all([platform.$connect(),db.$connect()]);
 });
 afterAll(async()=>{
  if(db)await db.$disconnect();
  if(platform)await platform.$disconnect();
 });

 it("seeds idempotently and NEVER grants consent, service rights, or regulated execution",async()=>{
  await assertIsolatedChessDemoDatabase(platform);
  await registerChessDemoTenant(platform);
  await registerChessDemoTenant(platform);
  const registry=await platform.tenantRegistry.findMany();
  expect(registry).toHaveLength(1);
  expect(registry[0]).toMatchObject({slug:"chess-demo",
   schemaName:"tenant_chess_demo",plan:"DEMO",status:"ACTIVE"});
  await assertIsolatedChessDemoDatabase(platform);
  await setupAndVerifyChessDemoFixtures(db);
  const fixture=await setupAndVerifyChessDemoFixtures(db);
  expect(fixture).toEqual({businessUnits:8,employeeAssignments:24,
   clients:5,pendingDisclosures:5});
  const unitSlugs=["accounting","bookkeeping","payroll","tax",
   "mortgage","insurance","homes","investments"];
  const units=await db.chessBusinessUnit.findMany({
   where:{slug:{in:unitSlugs}},select:{id:true},
  });
  const ids=units.map(x=>x.id);
  expect(units).toHaveLength(8);
  expect(await db.chessEmployeeAssignment.count({where:{
   businessId:{in:ids},revokedAt:null,
  }})).toBe(24);
  expect(await db.membership.count({where:{
   clerkUserId:{in:["user_fictional_chess_manager",
    "user_fictional_chess_staff_one","user_fictional_chess_staff_two"]},
  }})).toBe(3);
  const profiles=await db.clientProfile.findMany({
   where:{displayName:{endsWith:"(FICTIONAL)"}},select:{id:true},
  });
  expect(profiles).toHaveLength(5);
  const profileIds=profiles.map(p=>p.id);
  const links=await db.clientServiceLink.findMany({where:{
   profileId:{in:profileIds},businessId:{in:ids},
  },select:{id:true}});
  expect(links).toHaveLength(10);
  expect(await db.clientServiceGrant.count({where:{
   linkId:{in:links.map(l=>l.id)},
  }})).toBe(0);
  const consents=await db.chessClientConsent.findMany({where:{
   businessId:{in:ids},policyVersion:"fictional-demo-v1",
  },select:{status:true,consentedAt:true,acceptedByClerkUserId:true,
   verifiedEmailDigest:true,acceptanceEvidenceDigest:true}});
  expect(consents).toHaveLength(5);
  expect(consents.every(c=>c.status==="PENDING"&&
   !c.consentedAt&&!c.acceptedByClerkUserId&&
   !c.verifiedEmailDigest&&!c.acceptanceEvidenceDigest)).toBe(true);
  expect(await db.chessServiceCase.count({where:{
   businessId:{in:ids},
  }})).toBe(0);
  expect(await db.chessPractitionerCredential.count({where:{
   businessId:{in:ids},
  }})).toBe(0);
  expect(await db.chessBillingInvoice.count({where:{
   businessId:{in:ids},
  }})).toBe(0);
  expect(await db.chessWorkItem.count({where:{
   businessId:{in:ids},
   title:{startsWith:"Fictional "},
  }})).toBe(8);
 });
 it("fails safely if a foreign application schema exists in the demo database",async()=>{
  await platform.$executeRawUnsafe('CREATE SCHEMA "unrelated_fictional_customer"');
  try{
   await expect(assertIsolatedChessDemoDatabase(platform)).rejects.toThrow(
    /unrelated application schemas/);
  }finally{
   await platform.$executeRawUnsafe('DROP SCHEMA "unrelated_fictional_customer"');
  }
  await assertIsolatedChessDemoDatabase(platform);
 });
 it("refuses an unrelated registry even when more than three registrations exist",async()=>{
  const foreign=Array.from({length:4},(_,i)=>({
   slug:"foreign-fixture-"+i,schemaName:"foreign_schema_"+i,
   plan:"FREE",status:"ACTIVE",displayName:"UNRELATED FICTIONAL TENANT",
  }));
  await platform.tenantRegistry.createMany({data:foreign});
  try{
   await expect(assertIsolatedChessDemoDatabase(platform)).rejects.toThrow(
    /non-demo or inactive tenant/);
  }finally{
   await platform.tenantRegistry.deleteMany({where:{
    slug:{in:foreign.map(x=>x.slug)},
   }});
  }
  await assertIsolatedChessDemoDatabase(platform);
 });
 it("refuses unrelated public tables before registry mutation",async()=>{
  await platform.$executeRawUnsafe('CREATE TABLE "unrelated_fictional_demo" ("id" integer)');
  try{
   await expect(registerChessDemoTenant(platform)).rejects.toThrow(
    /unrelated public tables/);
  }finally{
   await platform.$executeRawUnsafe('DROP TABLE "unrelated_fictional_demo"');
  }
  await assertIsolatedChessDemoDatabase(platform);
 });

});
