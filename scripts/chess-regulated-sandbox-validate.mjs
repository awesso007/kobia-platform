// Manual sandbox-only M6 verification; no real client records, no loan
// origination, insurance quote/binding, brokerage contract or securities trade.
// The provider must expose a harmless coordination-ticket-only endpoint.
import {createHash,randomUUID} from "node:crypto";
function required(key){
 const value=process.env[key];
 if(!value)throw new Error(key+" must be supplied in the protected sandbox environment");
 return value;
}
function approvedUrl(value,host){
 const u=new URL(value);
 if(u.protocol!=="https:"||u.hostname!==host||u.username||u.password||u.hash)
  throw new Error("Sandbox gateway URL must match the approved HTTPS host.");
 return u;
}
async function post(url,key,payload,idempotency){
 const response=await fetch(url,{method:"POST",redirect:"error",cache:"no-store",
  headers:{"Content-Type":"application/json","Authorization":"Bearer "+key,
   ...(idempotency?{"Idempotency-Key":idempotency}:{})},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error("Sandbox gateway request failed HTTP "+response.status);
 return response.json();
}
if(process.env.CHESS_M6_SANDBOX_VALIDATE!=="true"||
 process.env.CHESS_M6_SANDBOX_ISOLATED!=="true")
 throw new Error("M6 isolated sandbox test has not been explicitly enabled.");
const service=required("CHESS_M6_SANDBOX_SERVICE");
if(!["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"].includes(service))
 throw new Error("Use one approved M6 service at a time.");
const firm=required("CHESS_M6_SANDBOX_FIRM_REGISTRY_ID");
const practitioner=required("CHESS_M6_SANDBOX_PRACTITIONER_REGISTRY_ID");
const jurisdiction=required("CHESS_M6_SANDBOX_JURISDICTION");
const licenseHost=required("CHESS_LICENSE_ALLOWED_HOST");
const licenseUrl=approvedUrl(required("CHESS_LICENSE_API_URL"),licenseHost);
const individualProof=await post(licenseUrl,required("CHESS_LICENSE_API_KEY"),{
 registryId:practitioner,service,jurisdiction,
});
const licenseHosts=required("CHESS_LICENSE_SOURCE_HOSTS").split(",").map(x=>x.trim());
const individualSource=approvedUrl(individualProof.sourceUrl,
 new URL(individualProof.sourceUrl).hostname);
if(!licenseHosts.includes(individualSource.hostname)||
 individualProof.registryId!==practitioner||individualProof.service!==service||
 individualProof.jurisdiction.toUpperCase()!==jurisdiction.toUpperCase()||
 individualProof.status!=="ACTIVE"||
 !Number.isFinite(Date.parse(individualProof.checkedAt))||
 Date.now()-Date.parse(individualProof.checkedAt)>24*60*60_000||
 Date.parse(individualProof.checkedAt)>Date.now()||
 (individualProof.expiresAt&&Date.parse(individualProof.expiresAt)<=Date.now()))
 throw new Error("Individual professional's official license proof is missing or stale");
console.log("PASS: individual professional status validated through official registry sandbox.");
const registryHost=required("CHESS_AFFILIATION_ALLOWED_HOST");
const affiliationUrl=approvedUrl(required("CHESS_AFFILIATION_API_URL"),registryHost);
const proof=await post(affiliationUrl,required("CHESS_AFFILIATION_API_KEY"),{
 practitionerRegistryId:practitioner,firmRegistryId:firm,service,jurisdiction,
});
const officialHosts=required("CHESS_AFFILIATION_SOURCE_HOSTS").split(",").map(x=>x.trim());
const evidenceHost=approvedUrl(proof.sourceUrl,
 new URL(proof.sourceUrl).hostname).hostname;
if(!officialHosts.includes(evidenceHost)||proof.practitionerRegistryId!==practitioner||
 proof.firmRegistryId!==firm||proof.service!==service||
 proof.jurisdiction.toUpperCase()!==jurisdiction.toUpperCase()||
 proof.status!=="ACTIVE"||!Number.isFinite(Date.parse(proof.checkedAt))||
 Date.now()-Date.parse(proof.checkedAt)>24*60*60_000||
 Date.parse(proof.checkedAt)>Date.now()||
 (proof.expiresAt&&Date.parse(proof.expiresAt)<=Date.now()))
 throw new Error("Affiliation proof is missing, stale or does not match official source");
console.log("PASS: independent official firm association exists in isolated registry sandbox.");

const host=required("CHESS_REGULATED_ALLOWED_HOST");
const createUrl=approvedUrl(required("CHESS_REGULATED_HANDOFF_API_URL"),host);
const statusUrl=approvedUrl(required("CHESS_REGULATED_STATUS_API_URL"),host);
const partnerId=required("CHESS_REGULATED_PARTNER_"+service);
const token=required("CHESS_REGULATED_PARTNER_"+service+"_API_KEY");
if(process.env.CHESS_REGULATED_RESPONSE_BINDING_REQUIRED!=="true")
 throw new Error("Regulated partner response echo contract has not been approved.");
const workflowId="sandbox-"+randomUUID();
const kind=({
 MORTGAGE:"MORTGAGE_DOCUMENT_INTAKE",
 INSURANCE:"INSURANCE_COVERAGE_INTAKE",
 REAL_ESTATE:"REAL_ESTATE_BUYER_INTAKE",
 INVESTMENTS:"INVESTMENTS_GOAL_DISCOVERY",
})[service];
const idempotencyKey=createHash("sha256").update(workflowId).digest("hex");
const context={
 tenantSlug:required("CHESS_M6_SANDBOX_TENANT"),
 businessId:required("CHESS_M6_SANDBOX_BUSINESS_ID"),
 serviceCaseId:"sandbox-service-case-"+randomUUID(),
 workflowId,service,kind,idempotencyKey,partnerId,
};
// The provider must confirm that these synthetic identifiers cannot trigger
// real underwriting, policy issuance, brokerage or investment execution.
const submitted=await post(createUrl,token,context,idempotencyKey);
if(submitted.workflowId!==workflowId||submitted.service!==service||
 submitted.partnerId!==partnerId||submitted.status!=="accepted"||
 typeof submitted.id!=="string"||!submitted.id)
 throw new Error("Sandbox coordination ticket was not independently acknowledged.");
const checked=await post(statusUrl,token,{
 tenantSlug:context.tenantSlug,businessId:context.businessId,
 serviceCaseId:context.serviceCaseId,workflowId,
 service,idempotencyKey,providerRequestId:submitted.id,partnerId,
});
if(checked.workflowId!==workflowId||checked.service!==service||
 checked.partnerId!==partnerId||checked.status!=="accepted"||
 checked.id!==submitted.id)
 throw new Error("Read-only status lookup does not reconcile the same ticket.");
console.log("PASS: test-only regulated coordination create and reconciliation for "+service+
 ". No customer PII or regulated transaction was submitted.");
console.log("SANDBOX CLEANUP: delete fictional provider ticket "+submitted.id+
 " in the provider's isolated test console if retention requires.");
