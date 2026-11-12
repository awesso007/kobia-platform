/**
 * CI-ONLY catalog preflight on a fresh disposable chess_demo_ci Postgres DB.
 * Never allow this to become an alternate, relaxed user demo setup path.
 */
import {PrismaClient as PlatformClient} from "../src/lib/db/generated/platform";
import {assertIsolatedChessDemoDatabase} from "../src/lib/chess/demo-target-policy";

async function main(){
 if(process.env.RUN_CHESS_DB_INTEGRATION!=="1"||
  new URL(process.env.DATABASE_URL??"").pathname!=="/chess_demo_ci"){
  throw new Error("CI preflight requires RUN_CHESS_DB_INTEGRATION=1 and chess_demo_ci.");
 }
 const db=new PlatformClient();
 try{
  await assertIsolatedChessDemoDatabase(db);
  console.log("[demo-preflight CI] Fresh disposable demo database accepted before DDL.");
 }finally{
  await db.$disconnect();
 }
}
main().catch(e=>{
 console.error(e instanceof Error?e.message:e);
 process.exitCode=1;
});
