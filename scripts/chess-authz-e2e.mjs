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
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||
  parsed.search||parsed.hash||parsed.pathname!=="/"||parsed.port)
  throw new Error("E2E target must be an exact HTTPS origin");
 return parsed.origin;
}
if(process.env.CHESS_AUTHZ_E2E_VALIDATE!=="true"||
 process.env.CHESS_AUTHZ_E2E_ISOLATED!=="true")
 throw new Error("Authenticated test is disabled until isolated fixtures exist.");
const own=base(required("CHESS_AUTHZ_E2E_BASE_URL"));
const otherTenant=base(required("CHESS_AUTHZ_E2E_OTHER_TENANT_URL"));
if(own===otherTenant)throw new Error("Provide two different tenant origins.");
const managerCookie=required("CHESS_AUTHZ_E2E_MANAGER_COOKIE");
const noGrantCookie=required("CHESS_AUTHZ_E2E_NO_GRANT_COOKIE");
if(!managerCookie.includes("=")||!noGrantCookie.includes("=")||
 managerCookie===noGrantCookie)
 throw new Error("Two distinct, live sandbox staff sessions are required.");
const businessId=required("CHESS_AUTHZ_E2E_BUSINESS_ID");
const otherBusinessId=required("CHESS_AUTHZ_E2E_OTHER_BUSINESS_ID");
const ownCaseId=required("CHESS_AUTHZ_E2E_SERVICE_CASE_ID");
const otherCaseId=required("CHESS_AUTHZ_E2E_OTHER_CASE_ID");
for(const id of [businessId,otherBusinessId,ownCaseId,otherCaseId]){
 if(!/^[A-Za-z0-9_-]{5,128}$/.test(id))
  throw new Error("Invalid opaque test fixture reference");
}
if(businessId===otherBusinessId||ownCaseId===otherCaseId)
 throw new Error("Fixture references are not independent.");
const month=required("CHESS_AUTHZ_E2E_MONTH");
if(!/^20[2-9][0-9]-(0[1-9]|1[0-2])$/.test(month))
 throw new Error("Invalid reporting month");
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
const csrf=await request(own,"/api/chess/billing",managerCookie,{
 method:"POST",headers:{"Content-Type":"application/json",
  "Origin":"https://attacker.example"},
 body:"{}",
});
assertCode("Cross-origin billing creation blocked without mutation",csrf,[403]);
console.log("Authenticated cross-tenant, cross-business, client-grant and CSRF regression PASS.");
