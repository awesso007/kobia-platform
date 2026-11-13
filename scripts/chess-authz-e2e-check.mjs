import {test} from "node:test";
import {strict as assert} from "node:assert";
import {spawnSync} from "node:child_process";
const script="scripts/chess-authz-e2e.mjs";
function run(overrides={}){
 return spawnSync(process.execPath,[script],{
  encoding:"utf8",timeout:5000,env:{
   ...process.env,
   CHESS_AUTHZ_E2E_VALIDATE:"false",CHESS_AUTHZ_E2E_ISOLATED:"false",
   ...overrides,
  },
 });
}
test("authenticated E2E cannot run without two explicit isolation approvals",()=>{
 const outcome=run();
 assert.notEqual(outcome.status,0);
 assert.match(outcome.stderr,/disabled until isolated fixtures exist/);
});
test("authenticated E2E refuses an unapproved HTTP destination before any requests",()=>{
 const outcome=run({
  CHESS_AUTHZ_E2E_VALIDATE:"true",CHESS_AUTHZ_E2E_ISOLATED:"true",
  CHESS_AUTHZ_E2E_ALLOWED_HOSTS:"one.staging.invalid,two.staging.invalid",
  CHESS_AUTHZ_E2E_BASE_URL:"http://one.staging.invalid/",
 });
 assert.notEqual(outcome.status,0);
 assert.match(outcome.stderr,/explicitly approved HTTPS staging host/);
});
test("authenticated E2E refuses non-exact deployed SHA before network",()=>{
 const result=run({
  CHESS_AUTHZ_E2E_VALIDATE:"true",CHESS_AUTHZ_E2E_ISOLATED:"true",
  CHESS_AUTHZ_E2E_ALLOWED_HOSTS:"one.staging.invalid,two.staging.invalid",
  CHESS_AUTHZ_E2E_BASE_URL:"https://one.staging.invalid/",
  CHESS_AUTHZ_E2E_OTHER_TENANT_URL:"https://two.staging.invalid/",
  CHESS_AUTHZ_E2E_RELEASE_SHA:"short",
 });
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/exact deployed release SHA/);
});
test("authenticated E2E requires two independent real origins",()=>{
 const outcome=run({
  CHESS_AUTHZ_E2E_VALIDATE:"true",CHESS_AUTHZ_E2E_ISOLATED:"true",
  CHESS_AUTHZ_E2E_ALLOWED_HOSTS:"one.staging.invalid,two.staging.invalid",
  CHESS_AUTHZ_E2E_BASE_URL:"https://one.staging.invalid/",
  CHESS_AUTHZ_E2E_OTHER_TENANT_URL:"https://one.staging.invalid/",
 });
 assert.notEqual(outcome.status,0);
 assert.match(outcome.stderr,/two different tenant origins/);
});
