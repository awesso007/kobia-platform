import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";
import {seedChessDemoRecords} from "./demo-fixtures";

const integration=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;

integration("CHESS fictional demo seed on isolated PostgreSQL",()=>{
 let db:PrismaClient;
 beforeAll(async()=>{db=new PrismaClient();await db.$connect();});
 afterAll(async()=>{if(db)await db.$disconnect();});

 it("seeds idempotently and NEVER grants consent, service rights, or regulated execution",async()=>{
  await seedChessDemoRecords(db);
  await seedChessDemoRecords(db);
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
  }})).toBe(8);
 });
});
