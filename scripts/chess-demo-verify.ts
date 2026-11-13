/**
 * Read-only post-setup verification. Requires the same explicit test-only
 * Neon/Clerk/environment gates as npm run demo:setup.
 * Does NOT sign in a Clerk user or prove a real browser E2E session.
 */
import {validateChessDemoEnvironment,CHESS_DEMO_SCHEMA} from "../src/lib/chess/demo-mode";
import {verifyChessDemoInstallation} from "../src/lib/chess/demo-setup-core";

async function main(){
 const {databaseUrl}=validateChessDemoEnvironment(process.env);
 const {PrismaClient:PlatformClient}=await import("../src/lib/db/generated/platform");
 const {PrismaClient:TenantClient}=await import("../src/lib/db/generated/tenant");
 const schemaUrl=new URL(databaseUrl);
 schemaUrl.searchParams.set("schema",CHESS_DEMO_SCHEMA);
 const platform=new PlatformClient({datasources:{db:{url:databaseUrl}}});
 const db=new TenantClient({datasources:{db:{url:schemaUrl.toString()}}});
 try{
  const result=await verifyChessDemoInstallation(platform,db);
  console.log("[demo:verify] PASS (FICTIONAL ONLY):",JSON.stringify(result));
  console.log("[demo:verify] Real Clerk sign-in and Codespaces preview browser remain separate manual checks.");
 }finally{
  await Promise.all([db.$disconnect(),platform.$disconnect()]);
 }
}

main().catch(error=>{
 console.error("[demo:verify] FAIL:",error instanceof Error?error.message:"Unknown verification failure");
 process.exitCode=1;
});
