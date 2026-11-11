import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
const code=readFileSync("scripts/chess-dr-restore-validate.mjs","utf8");
const flow=readFileSync(".github/workflows/chess-dr-restore-acceptance.yml","utf8");
test("DR evidence requires all three independent logical record witnesses",()=>{
 for(const name of ["CHESS_DR_WITNESS_SECURITY_EVENT_ID",
 "CHESS_DR_WITNESS_CONSENT_ID","CHESS_DR_WITNESS_INVOICE_ID"]){
  assert.match(code,new RegExp(name));
  assert.match(flow,new RegExp(name));
 }
});
test("manual DR acceptance does not run restore, schema migrations or unsafe copy",()=>{
 assert.match(flow,/workflow_dispatch/);
 assert.match(flow,/environment: chess-staging/);
 assert.match(flow,/CHESS_DR_ISOLATED_RESTORE/);
 assert.doesNotMatch(flow,/prisma migrate deploy|pg_restore|aws s3 cp|restore-db/);
});
