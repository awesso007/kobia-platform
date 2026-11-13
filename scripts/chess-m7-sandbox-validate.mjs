/** Strictly manual, fictional-only service contract validation.
 * It does not connect to customer databases, send bank/card credentials,
 * charge funds, execute an AI action, or post financial entries. */
import {createHash,randomUUID} from "node:crypto";
function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" is required in protected M7 sandbox");
 return value;
}
function approved(url,host){
 const parsed=new URL(url);
 if(parsed.protocol!=="https:"||parsed.hostname!==host||
   parsed.username||parsed.password||parsed.hash||parsed.port)
  throw new Error("The sandbox endpoint is not an approved HTTPS hostname");
 return parsed.toString();
}
async function post(url,token,payload,key,verifyAiCost=false){
 const response=await fetch(url,{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json",
   ...(key?{"Idempotency-Key":key}:{})},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)throw new Error("Sandbox provider returned HTTP "+response.status);
 if(verifyAiCost){
  const cost=response.headers.get("x-chess-ai-cost-micros");
  if(!cost||!/^[0-9]{1,9}$/.test(cost)||Number(cost)>5000)
   throw new Error("AI sandbox did not verify the approved per-request billable cost ceiling");
  const size=Number(response.headers.get("content-length")||0);
  if(size>2048)throw new Error("AI sandbox output exceeds approved size cap");
 }
 return response.json();
}
if(process.env.CHESS_M7_SANDBOX_VALIDATE!=="true"||
   process.env.CHESS_M7_SANDBOX_ISOLATED!=="true")
 throw new Error("M7 provider sandbox is disabled");
const aiUrl=approved(required("CHESS_AI_TRIAGE_API_URL"),
 required("CHESS_AI_ALLOWED_HOST"));
const task={status:"BLOCKED",dueBucket:"OVERDUE",hasAssignee:true};
const suggestion=await post(aiUrl,required("CHESS_AI_API_KEY"),{
 purpose:"WORK_ITEM_TRIAGE_V1",features:task,
 constraints:{maxOutputTokens:128,maxCostMicros:5000,
  retainInput:false,permitToolCalls:false},
},undefined,true);
if(!suggestion||suggestion.recommendation!=="ESCALATE_TO_MANAGER"||
 !["NORMAL","HIGH"].includes(suggestion.priority)||
 !["TASK_BLOCKED","DEADLINE_OVERDUE"].includes(suggestion.rationaleCode)||
 typeof suggestion.modelVersion!=="string"||
 !/^[A-Za-z0-9._-]{2,80}$/.test(suggestion.modelVersion))
 throw new Error("AI triage sandbox did not return a constrained recommendation");
console.log("PASS M7 synthetic metadata-only AI triage contract.");

const host=required("CHESS_BILLING_ALLOWED_HOST");
const deliveryUrl=approved(required("CHESS_BILLING_DELIVERY_API_URL"),host);
const statusUrl=approved(required("CHESS_BILLING_STATUS_API_URL"),host);
const token=required("CHESS_BILLING_API_KEY");
const invoiceId="sandbox-"+randomUUID();
const payload={tenantSlug:required("CHESS_M7_SANDBOX_TENANT"),
 businessId:required("CHESS_M7_SANDBOX_BUSINESS_ID"),
 clientProfileId:"sandbox-fictional-client",serviceCaseId:"sandbox-fictional-case",
 invoiceId,service:"BOOKKEEPING",descriptionCode:"BOOKKEEPING_MONTHLY",
 currency:"USD",amountCents:"100",
 idempotencyKey:createHash("sha256").update(invoiceId).digest("hex"),
};
const created=await post(deliveryUrl,token,payload,payload.idempotencyKey);
if(!created||created.invoiceId!==invoiceId||created.status!=="accepted"||
 typeof created.id!=="string"||!created.id)
 throw new Error("Invoice provider did not acknowledge a fictional invoice");
const confirmed=await post(statusUrl,token,{
 tenantSlug:payload.tenantSlug,businessId:payload.businessId,
 invoiceId,idempotencyKey:payload.idempotencyKey,providerInvoiceId:created.id,
});
if(!confirmed||confirmed.invoiceId!==invoiceId||
 confirmed.status!=="accepted"||confirmed.id!==created.id)
 throw new Error("Provider reconciliation did not match the same fictional invoice");
console.log("PASS M7 test-only invoice creation and read-only reconciliation.");
console.log("Verify synthetic provider invoice "+created.id+" is removed from the sandbox per retention policy.");
