import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";

const source=readFileSync("e2e/chess-demo-round46.spec.mjs","utf8");
const configuration=readFileSync("playwright.config.mjs","utf8");
const protectedWorkflow=readFileSync(".github/workflows/chess-demo-browser-e2e.yml","utf8");
const ci=readFileSync(".github/workflows/ci.yml","utf8");

test("Round 46 browser scenarios are discovered by protected Chromium project",()=>{
 assert.match(configuration,/round46/);
 assert.match(configuration,/dependencies:\s*\["clerk-setup"\]/);
 assert.match(configuration,/assertSafeChessDemoBrowserEnvironment/);
 assert.match(protectedWorkflow,/environment: chess-demo-e2e/);
 assert.match(protectedWorkflow,/workflow_dispatch/);
 assert.match(protectedWorkflow,/confirm_isolated_demo/);
 assert.match(protectedWorkflow,/npm run test:e2e/);
 assert.doesNotMatch(protectedWorkflow,/gh pr merge|vercel\/deploy|git push/);
});

test("Round 46 validates actual role-specific full browser workflows with nonterminal and no-provider controls",()=>{
 for(const phrase of [
  "owner navigates real fictional accounting task",
  "employee two stale browser tabs cannot overwrite",
  "support employee cannot change or create a mortgage task",
  "verified fictional client cannot accept consent",
  "calendar acknowledgement and independent appointment preference round trip",
  "narrow-screen employee and client retain role boundaries",
  "clerk.signIn",
  "expectedUpdatedAt:source.updatedAt",
  "toBe(409)",
  "toBe(403)",
  "PENDING",
  "getByRole(\"alert\")",
  "finally{await reset();}",
  "assertSeriousAxeClean",
 ])assert.ok(source.includes(phrase),"Missing Round 46 evidence: "+phrase);
 assert.match(source,/browser\.newContext/);
 assert.match(source,/context\.newPage/);
 assert.match(source,/\.reload\(\)/);
 assert.doesNotMatch(source,/sessionCookie|setCookie\(|sk_live_|pk_live_|CHESS_BANK_POSTING_ENABLED\s*=\s*true/);
});

test("ordinary CI syntax and source-policy checks do not pretend to run signed-in browser",()=>{
 assert.match(ci,/node --check e2e\/chess-demo-round46\.spec\.mjs/);
 assert.match(ci,/node --test scripts\/chess-demo-round46-policy-check\.mjs/);
 assert.doesNotMatch(ci,/npx playwright test|npm run test:e2e/);
 const setup=readFileSync("e2e/demo-harness.mjs","utf8");
 assert.match(setup,/CHESS_DEMO_MODE/);
 assert.match(setup,/chess_demo/);
 assert.match(setup,/pk_test_/);
 assert.match(setup,/sk_test_/);
});
