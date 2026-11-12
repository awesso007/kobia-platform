/**
 * Shared fixture registration + post-migration seeding for the isolated CHESS
 * fictional tenant. The CLI alone authenticates its caller's Neon, Clerk,
 * environment and database target BEFORE any migrations. CI calls these
 * post-migration helpers only with disposable PostgreSQL.
 */
import type {PrismaClient as PlatformDb} from "@/lib/db/generated/platform";
import type {PrismaClient as TenantDb} from "@/lib/db/generated/tenant";
import {CHESS_DEMO_SCHEMA,CHESS_DEMO_SLUG} from "./demo-mode";
import {assertIsolatedChessDemoDatabase} from "./demo-target-policy";
import {seedChessDemoRecords,verifyChessDemoRecords} from "./demo-fixtures";

export async function registerChessDemoTenant(platform:PlatformDb):Promise<void>{
 // Check again after platform+tenant migrations, including EVERY registry row.
 await assertIsolatedChessDemoDatabase(platform);
 const existing=await platform.tenantRegistry.findUnique({
  where:{slug:CHESS_DEMO_SLUG},
 });
 if(existing&&(existing.schemaName!==CHESS_DEMO_SCHEMA||
  existing.plan!=="DEMO"||existing.status!=="ACTIVE")){
  throw new Error("Refusing to overwrite an existing tenant mapping.");
 }
 await platform.tenantRegistry.upsert({
  where:{slug:CHESS_DEMO_SLUG},
  create:{slug:CHESS_DEMO_SLUG,schemaName:CHESS_DEMO_SCHEMA,
   status:"ACTIVE",plan:"DEMO",
   displayName:"CHESS Corporation - FICTIONAL SANDBOX"},
  update:{displayName:"CHESS Corporation - FICTIONAL SANDBOX"},
 });
}

export async function setupAndVerifyChessDemoFixtures(db:TenantDb){
 await seedChessDemoRecords(db);
 return verifyChessDemoRecords(db);
}
