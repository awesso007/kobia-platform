// Black-box HTTP security smoke test against a running production Next server.
// Uses no cookies, authentication credentials or database fixtures.
const base = process.env.CHESS_SMOKE_URL || "http://127.0.0.1:3100";
const allowedDenied = new Set([301,302,303,307,308,401,403]);
async function probe(path, options, expected) {
 const response=await fetch(base+path,{...options,redirect:"manual",signal:AbortSignal.timeout(10000)});
 const body=await response.text();
 if(!expected.has(response.status)) {
  throw new Error(`${path}: expected ${[...expected].join("/")} but received ${response.status}: ${body.slice(0,200)}`);
 }
 if(body.includes("CHESS_PAYROLL_API_KEY") || body.includes("CHESS_SCAN_WORKER_TOKEN"))
  throw new Error(`${path}: secret variable name leaked in response`);
 console.log(`PASS ${path}: ${response.status}`);
}
async function main() {
 const attempts=20;
 for(let i=0;i<attempts;i++){
  try{await fetch(base+"/",{signal:AbortSignal.timeout(2500)});break;}
  catch(error){if(i===attempts-1)throw error;await new Promise(r=>setTimeout(r,1000));}
 }
 await probe("/api/chess/scan-worker?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},body:'{"limit":1}',
 },new Set([403]));
 await probe("/api/chess/recurrences/run?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
 },new Set([403]));
 const untrusted=await fetch(base+"/api/chess/staging-attestation",{
  redirect:"manual",signal:AbortSignal.timeout(10000),
 });
 if(untrusted.status!==403||untrusted.headers.get("x-content-type-options")!=="nosniff"||
    untrusted.headers.get("x-frame-options")!=="DENY"||
    !(untrusted.headers.get("cache-control")??"").includes("no-store"))
  throw new Error("Private attestation must refuse anonymous access with secure headers.");
 await probe("/client-consents?tenant=fictional",{},allowedDenied);
 await probe("/client-consents/fictional-consent?tenant=fictional",{},allowedDenied);
 await probe("/api/chess/staging-attestation",{
  headers:{"Authorization":"Bearer invalid-demo-token"},
 },new Set([403]));
 await probe("/api/chess/audit-archive/run?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:"{}",
 },new Set([403]));
 await probe("/api/chess/recurring-billing/run?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
 },new Set([403]));
 await probe("/api/chess/merchant-events?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
 },new Set([403]));
 await probe("/api/chess/merchant-observations?businessId=unowned",
  {},allowedDenied);
 await probe("/api/chess/recurring-billing?businessId=unowned",
  {},allowedDenied);
 await probe("/api/chess/operational-close?businessId=unowned&month=2026-10",
  {},allowedDenied);
 await probe("/api/chess/ai-triage/run?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:"{}",
 },new Set([403]));
 await probe("/api/chess/payroll-status/run?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
 },new Set([403]));
 await probe("/api/chess/calendar-sync/run?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
 },new Set([403]));
 await probe("/api/chess/manager-queue?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/appointments?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/appointments-calendar.ics?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/staff?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/bank-reviews?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/bank-feed?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/bank-feed/import",{
  method:"POST",headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},body:"{}",
 },allowedDenied);
 await probe("/api/chess/tax-workpapers?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/payroll-status?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/ai-triage?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/billing?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/operations-report?businessId=unowned&month=2026-11",{},allowedDenied);
 await probe("/api/chess/billing-delivery",{
  method:"POST",headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},body:"{}",
 },allowedDenied);
 // Round 9: no anonymous business portfolio data or invoice/AI mutations.
 await probe("/api/chess/operations-report/portfolio?month=2026-11&format=json",
  {},allowedDenied);
 await probe("/api/chess/operations-report/portfolio?month=2026-11&format=csv",
  {},allowedDenied);
 await probe("/api/chess/billing",{
  method:"DELETE",headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},body:"{}",
 },allowedDenied);
 await probe("/api/chess/ai-triage",{
  method:"PATCH",headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},body:"{}",
 },allowedDenied);
 await probe("/api/chess/ai-triage",{
  method:"PUT",headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},body:"{}",
 },allowedDenied);
 await probe("/api/chess/worker-health",{},allowedDenied);
 await probe("/api/chess/alerts?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/calendar-preferences",{},allowedDenied);
 await probe("/api/chess/calendar.ics?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/payroll-execute",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":"https://attacker.example"},
  body:"{}",
 },allowedDenied);
 await probe("/api/chess/regulated-affiliations?businessId=unowned",{},allowedDenied);
 await probe("/api/chess/regulated-workflows?businessId=unowned&serviceCaseId=unowned",{},allowedDenied);
 await probe("/api/chess/regulated-handoffs",{
  method:"POST",headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},body:"{}",
 },allowedDenied);
 await probe("/api/chess/regulated-workflows",{
  method:"PATCH",headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},body:"{}",
 },allowedDenied);
 await probe("/api/chess/license-verify",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":"https://attacker.example"},
  body:"{}",
 },allowedDenied);
 await probe("/api/chess/documents?businessId=unit&clientProfileId=client&service=TAX&documentId=doc",{},allowedDenied);
 await probe("/api/client-profiles",{},allowedDenied);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
