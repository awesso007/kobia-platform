import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";
import {PrismaClient as PlatformClient} from "@/lib/db/generated/platform";
import {registerChessDemoTenant,setupAndVerifyChessDemoFixtures,verifyChessDemoInstallation} from "./demo-setup-core";
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
  const installed=await verifyChessDemoInstallation(platform,db);
  expect(installed).toEqual({tenant:"chess-demo",schema:"tenant_chess_demo",fixture});
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
 it("keeps fictional employee tasks business-scoped while a client has PENDING consent only",async()=>{
  const [bookkeeping,mortgage,morgan]=await Promise.all([
   db.chessBusinessUnit.findUnique({where:{slug:"bookkeeping"},select:{id:true}}),
   db.chessBusinessUnit.findUnique({where:{slug:"mortgage"},select:{id:true}}),
   db.clientProfile.findFirst({where:{displayName:"Morgan Fictional (FICTIONAL)"},
    select:{id:true}}),
  ]);
  expect(bookkeeping?.id).toBeTruthy();
  expect(mortgage?.id).toBeTruthy();
  expect(morgan?.id).toBeTruthy();
  const [bookTasks,mortgageTasks,staffAssignments,links,disclosures]=await Promise.all([
   db.chessWorkItem.findMany({where:{businessId:bookkeeping!.id,
    title:{startsWith:"Fictional "}},select:{id:true,businessId:true,
     assignedClerkUserId:true,status:true}}),
   db.chessWorkItem.findMany({where:{businessId:mortgage!.id,
    title:{startsWith:"Fictional "}},select:{id:true,businessId:true}}),
   db.chessEmployeeAssignment.findMany({where:{businessId:bookkeeping!.id,
    revokedAt:null},select:{clerkUserId:true,role:true}}),
   db.clientServiceLink.findMany({where:{profileId:morgan!.id},
    select:{id:true,businessId:true,grants:{select:{id:true}}}}),
   db.chessClientConsent.findMany({where:{clientProfileId:morgan!.id,
    policyVersion:"fictional-demo-v1"},select:{status:true,consentedAt:true,
     verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
  ]);
  expect(bookTasks).toHaveLength(1);
  expect(mortgageTasks).toHaveLength(1);
  expect(bookTasks[0]!.id).not.toBe(mortgageTasks[0]!.id);
  expect(bookTasks[0]!.businessId).toBe(bookkeeping!.id);
  expect(bookTasks[0]!.status).toBe("TODO");
  expect(staffAssignments.some(a=>a.clerkUserId===
   bookTasks[0]!.assignedClerkUserId)).toBe(true);
  expect(links).toHaveLength(2);
  expect(links.every(l=>l.grants.length===0)).toBe(true);
  expect(disclosures).toHaveLength(1);
  expect(disclosures[0]!.status).toBe("PENDING");
  expect(disclosures[0]!.consentedAt).toBeNull();
  expect(disclosures[0]!.verifiedEmailDigest).toBeNull();
  expect(disclosures[0]!.acceptanceEvidenceDigest).toBeNull();
  expect(await db.chessServiceCase.count({where:{
   clientProfileId:morgan!.id,
  }})).toBe(0);
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

 it("Round 46 guards the exact fictional graph for all eight businesses and five clients without service grants",async()=>{
  const units=await db.chessBusinessUnit.findMany({where:{
   slug:{in:["accounting","bookkeeping","payroll","tax","mortgage",
    "insurance","homes","investments"]},
  },select:{id:true,slug:true,status:true}});
  expect(units).toHaveLength(8);
  expect(units.every(x=>x.status==="ACTIVE")).toBe(true);
  const unitIds=new Set(units.map(u=>u.id));
  const profiles=await db.clientProfile.findMany({
   where:{displayName:{endsWith:"(FICTIONAL)"}},
   select:{id:true,displayName:true},
  });
  expect(profiles).toHaveLength(5);
  const [links,consents,grants,documents,serviceCases]=await Promise.all([
   db.clientServiceLink.findMany({where:{
    profileId:{in:profiles.map(p=>p.id)},
   },select:{id:true,profileId:true,businessId:true,service:true}}),
   db.chessClientConsent.findMany({where:{
    clientProfileId:{in:profiles.map(p=>p.id)},
    policyVersion:"fictional-demo-v1",
   },select:{clientProfileId:true,purpose:true,status:true,
    acceptedByClerkUserId:true,consentedAt:true,
    verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
   db.clientServiceGrant.count({where:{
    link:{profileId:{in:profiles.map(p=>p.id)}},
   }}),
   db.chessClientDocument.count({where:{
    clientProfileId:{in:profiles.map(p=>p.id)},
   }}),
   db.chessServiceCase.count({where:{
    clientProfileId:{in:profiles.map(p=>p.id)},
   }}),
  ]);
  expect(links).toHaveLength(10);
  expect(consents).toHaveLength(5);
  expect(grants).toBe(0);
  expect(documents).toBe(0);
  expect(serviceCases).toBe(0);
  for(const profile of profiles){
   const related=links.filter(x=>x.profileId===profile.id);
   expect(related).toHaveLength(2);
   expect(new Set(related.map(x=>x.businessId)).size).toBe(2);
   expect(related.every(x=>unitIds.has(x.businessId))).toBe(true);
   const personal=consents.filter(x=>x.clientProfileId===profile.id);
   expect(personal).toHaveLength(1);
   expect(personal[0]).toMatchObject({status:"PENDING",
    acceptedByClerkUserId:null,consentedAt:null,verifiedEmailDigest:null,
    acceptanceEvidenceDigest:null});
  }
 },15000);

 it("Round 46 refuses an unauthorized demo consent accept and preserves the seeded disclosure",async()=>{
  const morgan=await db.clientProfile.findFirstOrThrow({where:{
   displayName:"Morgan Fictional (FICTIONAL)",
  },select:{id:true}});
  const consent=await db.chessClientConsent.findFirstOrThrow({where:{
   clientProfileId:morgan.id,policyVersion:"fictional-demo-v1",
  },select:{id:true,status:true,consentedAt:true,
   acceptedByClerkUserId:true,verifiedEmailDigest:true}});
  expect(consent.status).toBe("PENDING");
  await expect(db.chessClientConsent.update({where:{id:consent.id},
   data:{status:"GRANTED"},
  })).rejects.toThrow();
  const unchanged=await db.chessClientConsent.findUniqueOrThrow({where:{id:consent.id},
   select:{status:true,consentedAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true}});
  expect(unchanged).toMatchObject({status:"PENDING",consentedAt:null,
   acceptedByClerkUserId:null,verifiedEmailDigest:null});
  expect((await verifyChessDemoInstallation(platform,db)).fixture)
   .toMatchObject({businessUnits:8,clients:5,pendingDisclosures:5});
 },15000);

});
