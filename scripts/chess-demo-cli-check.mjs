import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

const env={
 ...process.env,
 NODE_ENV:"production",
 CHESS_DEMO_MODE:"true",
 NEXT_PUBLIC_DEFAULT_TENANT:"chess-demo",
 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:"pk_test_fictional",
 CLERK_SECRET_KEY:"sk_test_fictional",
 CHESS_DEMO_OWNER_EMAIL:"owner@example.invalid",
 DATABASE_URL:"postgresql://fictitious:fake@ep-not-real.neon.tech/chess_demo?sslmode=require",
};
for(const script of ["scripts/chess-demo-setup.ts","scripts/chess-demo-verify.ts"]){
 test(script+" rejects production before contacting a database",()=>{
  const result=spawnSync(process.execPath,["--import","tsx",script],{
   env,encoding:"utf8",timeout:20_000,maxBuffer:300_000,
  });
  assert.equal(result.status,1,script+" unexpectedly accepted production");
  assert.match(result.stderr,/forbidden when NODE_ENV=production/);
 });
}
test("setup CLI refuses non-test Clerk credentials before running any migration",()=>{
 const result=spawnSync(process.execPath,
  ["--import","tsx","scripts/chess-demo-setup.ts"],{
   env:{...env,NODE_ENV:"development",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:"pk_live_disallowed"},
   encoding:"utf8",timeout:20_000,maxBuffer:300_000,
  });
 assert.equal(result.status,1);
 assert.match(result.stderr,/Only Clerk TEST publishable and secret keys/);
});
