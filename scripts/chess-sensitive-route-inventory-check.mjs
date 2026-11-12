import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { strict as assert } from "node:assert";

/**
 * Explicit bounded inventory for KOBIA's CHESS-specific service API routes.
 * Classification means "must be reviewed under this policy boundary", not
 * "proven audited". Independent static/dynamic audit is still required.
 * Unknown added routes fail normal CI until classified.
 */
const registered = new Set([
  "chess/action-approvals/route.ts",
  "chess/ai-triage/route.ts",
  "chess/ai-triage/run/route.ts",
  "chess/alerts/route.ts",
  "chess/appointments-calendar.ics/route.ts",
  "chess/appointments/route.ts",
  "chess/audit-archive/run/route.ts",
  "chess/bank-feed/import/route.ts",
  "chess/bank-feed/route.ts",
  "chess/bank-posting-preview/route.ts",
  "chess/bank-posting/route.ts",
  "chess/bank-reconciliation/route.ts",
  "chess/bank-review-candidates/route.ts",
  "chess/bank-reviews/route.ts",
  "chess/billing-delivery/route.ts",
  "chess/billing/route.ts",
  "chess/business-units/route.ts",
  "chess/calendar-oauth/route.ts",
  "chess/calendar-preferences/route.ts",
  "chess/calendar-sync/run/route.ts",
  "chess/calendar.ics/route.ts",
  "chess/client-consent/route.ts",
  "chess/consents/route.ts",
  "chess/document-lifecycle/route.ts",
  "chess/document-purge/run/route.ts",
  "chess/document-scan/route.ts",
  "chess/documents/[id]/download/route.ts",
  "chess/documents/route.ts",
  "chess/employee-assignments/route.ts",
  "chess/finance/route.ts",
  "chess/incident-health/route.ts",
  "chess/license-verify/route.ts",
  "chess/manager-queue/route.ts",
  "chess/merchant-events/route.ts",
  "chess/merchant-observations/route.ts",
  "chess/operational-close/route.ts",
  "chess/operations-report/portfolio/route.ts",
  "chess/operations-report/route.ts",
  "chess/payroll-approvals/route.ts",
  "chess/payroll-execute/route.ts",
  "chess/payroll-status/route.ts",
  "chess/payroll-status/run/route.ts",
  "chess/recurrences/route.ts",
  "chess/recurrences/run/route.ts",
  "chess/recurring-billing/route.ts",
  "chess/recurring-billing/run/route.ts",
  "chess/regulated-affiliations/route.ts",
  "chess/regulated-handoffs/route.ts",
  "chess/regulated-workflows/route.ts",
  "chess/scan-worker/route.ts",
  "chess/service-cases/route.ts",
  "chess/staff/route.ts",
  "chess/staging-attestation/route.ts",
  "chess/tax-workpapers/route.ts",
  "chess/work-items/route.ts",
  "chess/worker-health/route.ts",
  "client-profiles/[profileId]/services/route.ts",
  "client-profiles/route.ts",
  "client-service-links/[linkId]/grants/route.ts"
]);
const machine = new Set([
  "chess/ai-triage/run/route.ts",
  "chess/audit-archive/run/route.ts",
  "chess/calendar-sync/run/route.ts",
  "chess/document-scan/route.ts",
  "chess/document-purge/run/route.ts",
  "chess/incident-health/route.ts",
  "chess/merchant-events/route.ts",
  "chess/payroll-status/run/route.ts",
  "chess/recurrences/run/route.ts",
  "chess/recurring-billing/run/route.ts",
  "chess/scan-worker/route.ts",
  "chess/staging-attestation/route.ts"
]);
const client = new Set(["chess/client-consent/route.ts"]);

function collect(directory,root,found=[]){
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const absolute=join(directory,entry.name);
  if(entry.isDirectory())collect(absolute,root,found);
  else if(entry.name==="route.ts")found.push(relative(root,absolute).replaceAll("\\","/"));
 }
 return found;
}
const root=join(process.cwd(),"src","app","api");
const actual=[
 ...collect(join(root,"chess"),root),
 ...collect(join(root,"client-profiles"),root),
 ...collect(join(root,"client-service-links"),root),
].sort();

test("classifies every CHESS-specific service API route with no silent omission",()=>{
 const unknown=actual.filter(path=>!registered.has(path));
 const stale=[...registered].filter(path=>!actual.includes(path));
 assert.deepEqual(unknown,[],"New sensitive API routes require risk classification.");
 assert.deepEqual(stale,[],"Manifest must track current API files.");
 assert.equal(machine.size,12);
 assert.equal(client.size,1);
 for(const path of [...machine,...client])assert.ok(registered.has(path));
});

test("distinguishes machine, verified-client and employee boundaries",()=>{
 const counted={machine:0,client:0,employee:0,reads:0};
 for(const path of actual){
  const boundary=machine.has(path)?"machine":
   client.has(path)?"client":"employee";
  counted[boundary]++;
  const source=readFileSync(join(root,path),"utf8");
  assert.match(source,/export\s+(?:async\s+)?function\s+(?:GET|POST|PATCH|PUT|DELETE)|export\s+const\s+(?:GET|POST|PATCH|PUT|DELETE)/,
   "Route must expose a clearly named HTTP handler.");
  if(/export\s+(?:async\s+)?function\s+GET|export\s+const\s+GET/.test(source))
   counted.reads++;
 }
 assert.equal(counted.machine,12);
 assert.equal(counted.client,1);
 assert.equal(counted.employee,registered.size-13);
 assert.ok(counted.reads>0);
 // These counts classify explicit source files; they do not establish
 // per-client grants, runtime consent, immutable audit or legal compliance.
});
