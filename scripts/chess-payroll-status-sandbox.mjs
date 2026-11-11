// Read-only payroll vendor status contract. Requires a pre-existing, fully
// fictional sandbox pay-run record created within the approved payroll vendor.
// NEVER submits payroll, bank transfers, paystubs or tax remittances.
function required(key){
 const value=process.env[key];
 if(!value)throw new Error(key+" missing");
 return value;
}
if(process.env.CHESS_PAYROLL_SANDBOX_VALIDATE!=="true"||
 process.env.CHESS_PAYROLL_SANDBOX_ISOLATED!=="true")
 throw new Error("Payroll status sandbox validation not enabled.");
const raw=required("CHESS_PAYROLL_STATUS_API_URL");
const host=required("CHESS_PAYROLL_ALLOWED_HOST");
const u=new URL(raw);
if(u.protocol!=="https:"||u.hostname!==host||u.username||u.password||u.hash)
 throw new Error("Payroll status URL must be an approved HTTPS host");
const tenantId=required("CHESS_PAYROLL_SANDBOX_TENANT_ID");
const entityId=required("CHESS_PAYROLL_SANDBOX_ENTITY_ID");
const payRunId=required("CHESS_PAYROLL_SANDBOX_PAYRUN_ID");
const providerRequestId=required("CHESS_PAYROLL_SANDBOX_PROVIDER_REQUEST_ID");
const idempotencyKey=required("CHESS_PAYROLL_SANDBOX_IDEMPOTENCY_KEY");
const response=await fetch(u,{method:"POST",cache:"no-store",redirect:"error",
 headers:{"Authorization":"Bearer "+required("CHESS_PAYROLL_API_KEY"),
  "Content-Type":"application/json"},
 body:JSON.stringify({tenantId,entityId,payRunId,providerRequestId,idempotencyKey}),
 signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error("Sandbox status lookup failed HTTP "+response.status);
const body=await response.json();
if(!body||body.payRunId!==payRunId||body.providerRequestId!==providerRequestId||
 !["accepted","pending","paid","failed","rejected","unknown","not_found"].includes(body.status)||
 !Number.isFinite(Date.parse(body.observedAt)))
 throw new Error("Payroll status provider did not satisfy its identity and outcome contract");
console.log("PASS read-only sandbox payroll status contract; vendor assertion "+body.status+
 "; no payroll or tax transaction executed.");
