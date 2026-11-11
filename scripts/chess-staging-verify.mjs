/** Manual-only external staging identity check.
 * Network contact is restricted to exactly one explicitly allowlisted HTTPS
 * host. Does not mutate or deploy the live application. */
function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" missing from protected staging environment");
 return value;
}
if(process.env.CHESS_STAGING_VALIDATE!=="true")
 throw new Error("Staging validation requires explicit environment approval.");
const raw=required("CHESS_STAGING_BASE_URL");
const host=required("CHESS_STAGING_ALLOWED_HOST");
const url=new URL(raw);
if(url.protocol!=="https:"||url.hostname!==host||url.username||
 url.password||url.port||url.search||url.hash||url.pathname!=="/")
 throw new Error("Staging target must be a protected, exact HTTPS origin.");
const expected=required("CHESS_STAGING_EXPECTED_SHA");
if(!/^[a-f0-9]{40}$/.test(expected))
 throw new Error("Expected deployment commit must be the exact 40-character SHA.");
const token=required("CHESS_STAGING_ATTESTATION_TOKEN");
if(token.length<32)throw new Error("Protected attestation token is too short.");
const response=await fetch(url.origin+"/api/chess/staging-attestation",{
 method:"GET",redirect:"error",cache:"no-store",
 headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
 signal:AbortSignal.timeout(10000),
});
if(response.status!==200)throw new Error("Deployed staging identity check did not authenticate.");
if(!(response.headers.get("cache-control")??"").toLowerCase().includes("no-store"))
 throw new Error("Staging attestation response may be cached.");
if(response.headers.get("x-content-type-options")!=="nosniff"||
 response.headers.get("x-frame-options")!=="DENY")
 throw new Error("Deployed staging response is missing private security headers.");
const anonymous=await fetch(url.origin+"/api/chess/staging-attestation",{
 method:"GET",redirect:"error",cache:"no-store",
 headers:{"Accept":"application/json"},
 signal:AbortSignal.timeout(10000),
});
if(anonymous.status!==403)
 throw new Error("Deployed staging disclosed build identity without machine authentication.");
const result=await response.json();
if(!result||Object.keys(result).sort().join(",")!=="environment,releaseSha"||
 result.releaseSha!==expected||result.environment!=="staging")
 throw new Error("Deployed staging build identity does not match the approved commit.");
console.log("PASS deployed staging returned the expected protected build identity.");
console.log("NOTE: Manual authenticated E2E, backup restoration, provider sandbox and approval remain separate.");
