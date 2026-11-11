import {test} from "node:test";
import {strict as assert} from "node:assert";
import {spawnSync} from "node:child_process";
function launch(overrides){
 return spawnSync(process.execPath,["scripts/chess-staging-verify.mjs"],{
  encoding:"utf8",timeout:5000,env:{
   ...process.env,
   CHESS_STAGING_VALIDATE:"false",
   CHESS_STAGING_BASE_URL:"https://stage.invalid/",
   CHESS_STAGING_ALLOWED_HOST:"stage.invalid",
   CHESS_STAGING_EXPECTED_SHA:"a".repeat(40),
   CHESS_STAGING_ATTESTATION_TOKEN:"T".repeat(36),
   ...overrides,
  },
 });
}
test("deployed staging verifier refuses execution without explicit release approval",()=>{
 const result=launch({});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/requires explicit environment approval/);
});
test("deployed staging verifier blocks unapproved host and plain HTTP before network",()=>{
 const result=launch({
  CHESS_STAGING_VALIDATE:"true",
  CHESS_STAGING_BASE_URL:"http://stage.invalid/",
 });
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/exact HTTPS origin/);
});
test("deployed staging verifier refuses an imprecise release SHA",()=>{
 const result=launch({
  CHESS_STAGING_VALIDATE:"true",
  CHESS_STAGING_EXPECTED_SHA:"short",
 });
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/exact 40-character SHA/);
});
