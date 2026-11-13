/** Manual only. Read-only signed-in cross-tenant authorization smoke.
 * Needs two isolated fictional tenants/businesses and temporary Clerk
 * session cookies. Never use customer accounts or production auth cookies. */
function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" required in protected test environment");
 return value;
}
function base(raw){
 const parsed=new URL(raw);
 const trusted=required("CHESS_AUTHZ_E2E_ALLOWED_HOSTS").split(",")
  .map(host=>host.trim()).filter(Boolean);
 if(trusted.length!==2||new Set(trusted).size!==2||
  parsed.protocol!=="https:"||!trusted.includes(parsed.hostname)||
  parsed.username||parsed.password||
  parsed.search||parsed.hash||parsed.pathname!=="/"||parsed.port)
  throw new Error("E2E target must be an explicitly approved HTTPS staging host");
 return parsed.origin;
}
if(process.env.CHESS_AUTHZ_E2E_VALIDATE!=="true"||
 process.env.CHESS_AUTHZ_E2E_ISOLATED!=="true")
 throw new Error("Authenticated test is disabled until isolated fixtures exist.");
const own=base(required("CHESS_AUTHZ_E2E_BASE_URL"));
const otherTenant=base(required("CHESS_AUTHZ_E2E_OTHER_TENANT_URL"));
if(own===otherTenant)throw new Error("Provide two different tenant origins.");
const releaseSha=required("CHESS_AUTHZ_E2E_RELEASE_SHA");
if(!/^[a-f0-9]{40}$/.test(releaseSha))
 throw new Error("Authenticated E2E requires exact deployed release SHA.");
const attestationA=required("CHESS_AUTHZ_E2E_ATTESTATION_TOKEN_A");
const attestationB=required("CHESS_AUTHZ_E2E_ATTESTATION_TOKEN_B");
if(attestationA.length<32||attestationB.length<32||attestationA===attestationB)
 throw new Error("Distinct protected tenant staging attestation tokens are required.");
async function verifyStaging(origin,token){
 const response=await fetch(origin+"/api/chess/staging-attestation",{
  headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
  cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000),
 });
 if(response.status!==200||
  !(response.headers.get("cache-control")??"").includes("no-store")||
  response.headers.get("x-content-type-options")!=="nosniff"||
  response.headers.get("x-frame-options")!=="DENY")
  throw new Error("Protected tenant staging build attestation rejected.");
 const body=await response.json();
 if(!body||Object.keys(body).sort().join(",")!=="environment,releaseSha"||
  body.environment!=="staging"||body.releaseSha!==releaseSha)
  throw new Error("Deployed tenant release SHA mismatch.");
}
const managerCookie=required("CHESS_AUTHZ_E2E_MANAGER_COOKIE");
const noGrantCookie=required("CHESS_AUTHZ_E2E_NO_GRANT_COOKIE");
const foreignCookie=required("CHESS_AUTHZ_E2E_OTHER_TENANT_MANAGER_COOKIE");
if(!managerCookie.includes("=")||!noGrantCookie.includes("=")||
 managerCookie===noGrantCookie||foreignCookie===managerCookie||
 foreignCookie===noGrantCookie||!foreignCookie.includes("="))
 throw new Error("Two distinct, live sandbox staff sessions are required.");
const businessId=required("CHESS_AUTHZ_E2E_BUSINESS_ID");
const otherBusinessId=required("CHESS_AUTHZ_E2E_OTHER_BUSINESS_ID");
const ownCaseId=required("CHESS_AUTHZ_E2E_SERVICE_CASE_ID");
const otherCaseId=required("CHESS_AUTHZ_E2E_OTHER_CASE_ID");
const revokedCaseId=required("CHESS_AUTHZ_E2E_REVOKED_CASE_ID");
const foreignBusinessId=required("CHESS_AUTHZ_E2E_OTHER_TENANT_BUSINESS_ID");
for(const id of [businessId,otherBusinessId,ownCaseId,otherCaseId,
 revokedCaseId,foreignBusinessId]){
 if(!/^[A-Za-z0-9_-]{5,128}$/.test(id))
  throw new Error("Invalid opaque test fixture reference");
}
if(businessId===otherBusinessId||ownCaseId===otherCaseId||
 revokedCaseId===ownCaseId||revokedCaseId===otherCaseId)
 throw new Error("Fixture references are not independent.");
const month=required("CHESS_AUTHZ_E2E_MONTH");
if(!/^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(month))
 throw new Error("Invalid reporting month");
await verifyStaging(own,attestationA);
await verifyStaging(otherTenant,attestationB);
console.log("PASS separately attested two-tenant deployed SHA.");
async function request(origin,path,cookie,options={}){
 const reply=await fetch(origin+path,{
  ...options,redirect:"manual",cache:"no-store",
  headers:{"Cookie":cookie,"Accept":"application/json",
   ...(options.headers??{})},
  signal:AbortSignal.timeout(15000),
 });
 // Never log cookies, response body, client identifiers, tenant names or URLs.
 return reply.status;
}
function assertCode(label,actual,expected){
 if(!expected.includes(actual))
  throw new Error(label+" authorization mismatch: HTTP "+actual);
 console.log("PASS "+label+" (HTTP "+actual+")");
}
const permitted=await request(own,
 `/api/chess/operations-report?businessId=${encodeURIComponent(businessId)}&month=${month}`,
 managerCookie);
assertCode("Authorized owner-level business reporting",permitted,[200]);
const cases=await request(own,
 `/api/chess/regulated-workflows?businessId=${encodeURIComponent(businessId)}&serviceCaseId=${encodeURIComponent(ownCaseId)}`,
 managerCookie);
assertCode("Explicitly granted active client service case",cases,[200]);
const crossBusiness=await request(own,
 `/api/chess/operations-report?businessId=${encodeURIComponent(otherBusinessId)}&month=${month}`,
 managerCookie);
assertCode("Cross-business operational reporting denied",crossBusiness,[403,404]);
const crossCase=await request(own,
 `/api/chess/regulated-workflows?businessId=${encodeURIComponent(otherBusinessId)}&serviceCaseId=${encodeURIComponent(otherCaseId)}`,
 managerCookie);
assertCode("Cross-business client case denied",crossCase,[403,404]);
const staffNoGrant=await request(own,
 `/api/chess/regulated-workflows?businessId=${encodeURIComponent(businessId)}&serviceCaseId=${encodeURIComponent(ownCaseId)}`,
 noGrantCookie);
assertCode("Unassigned staff cannot read granted client case",staffNoGrant,[403,404]);
const staffReport=await request(own,
 `/api/chess/operations-report?businessId=${encodeURIComponent(businessId)}&month=${month}`,
 noGrantCookie);
assertCode("Nonadministrator cannot access business reporting",staffReport,[403,404]);
const foreignTenant=await request(otherTenant,
 `/api/chess/operations-report?businessId=${encodeURIComponent(businessId)}&month=${month}`,
 managerCookie);
assertCode("Foreign tenant cannot read original business records",foreignTenant,[403,404]);
const foreignOwner=await request(otherTenant,
 `/api/chess/operations-report?businessId=${encodeURIComponent(foreignBusinessId)}&month=${month}`,
 foreignCookie);
assertCode("Independent tenant B manager can access only B reports",foreignOwner,[200]);
const foreignManagerOnA=await request(own,
 `/api/chess/operations-report?businessId=${encodeURIComponent(businessId)}&month=${month}`,
 foreignCookie);
assertCode("B member session cannot enter tenant A",foreignManagerOnA,[403,404]);
const ownManagerOnB=await request(otherTenant,
 `/api/chess/operations-report/portfolio?month=${month}`,managerCookie);
assertCode("A member session cannot access B portfolio",ownManagerOnB,[403,404]);
const ownPortfolio=await request(own,
 `/api/chess/operations-report/portfolio?month=${month}`,managerCookie);
assertCode("A active owner can view tenant A portfolio",ownPortfolio,[200]);
const staffPortfolio=await request(own,
 `/api/chess/operations-report/portfolio?month=${month}`,noGrantCookie);
assertCode("Ungrafted staff denied tenant portfolio",staffPortfolio,[403,404]);
const revokedConsent=await request(own,
 `/api/chess/regulated-workflows?businessId=${encodeURIComponent(businessId)}&serviceCaseId=${encodeURIComponent(revokedCaseId)}`,
 managerCookie);
assertCode("Revoked service consent immediately blocks case access",revokedConsent,[403,404]);
const billingRead=await request(own,
 `/api/chess/billing?businessId=${encodeURIComponent(businessId)}`,
 managerCookie);
assertCode("Authorized manager may list currently granted invoices",billingRead,[200]);
const staffBillingRead=await request(own,
 `/api/chess/billing?businessId=${encodeURIComponent(businessId)}`,
 noGrantCookie);
assertCode("Staff cannot view invoice metadata",staffBillingRead,[403,404]);
const csrf=await request(own,"/api/chess/billing",managerCookie,{
 method:"POST",headers:{"Content-Type":"application/json",
  "Origin":"https://attacker.example"},
 body:"{}",
});
assertCode("Cross-origin billing creation blocked without mutation",csrf,[403]);
for(const [label,path,method] of [
 ["Forged invoice void", "/api/chess/billing","DELETE"],
 ["Forged AI triage review", "/api/chess/ai-triage","PATCH"],
 ["Forged regulated workflow decision", "/api/chess/regulated-workflows","PATCH"],
]){
 const result=await request(own,path,managerCookie,{
  method,headers:{"Content-Type":"application/json",
   "Origin":"https://attacker.example"},
  body:"{}",
 });
 assertCode(label+" blocked before mutation",result,[403]);
}
const staffSnapshot=await request(own,
 `/api/chess/operational-close?businessId=${encodeURIComponent(businessId)}&month=${month}`,
 noGrantCookie);
assertCode("Unauthorized employee cannot read historical reporting evidence",staffSnapshot,[403,404]);
const staffMerchant=await request(own,
 `/api/chess/merchant-observations?businessId=${encodeURIComponent(businessId)}`,
 noGrantCookie);
assertCode("Unauthorized employee cannot read merchant observations",staffMerchant,[403,404]);
const originAttack=await request(own,"/api/chess/document-lifecycle",managerCookie,{
 method:"POST",headers:{"Content-Type":"application/json",
  "Origin":"https://attacker.example"},body:"{}",
});
assertCode("Cross-origin document legal hold change denied",originAttack,[403]);
console.log("PASS signed-in two-tenant, revoked-consent, operational/merchant reporting and CSRF regression.");
