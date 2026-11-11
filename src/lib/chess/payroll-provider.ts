import {createHash} from "node:crypto";
import {z} from "zod";

const response=z.object({
 id:z.string().min(1).max(200),
 status:z.enum(["accepted","rejected","pending"]),
}).strict();

/** A configurable adapter for an approved payroll vendor's execution API.
 * This is not a generic payroll engine. Only non-PII references are sent.
 * The partner must resolve verified employees, bank instructions, taxes and
 * approvals on its side before transmitting any ACH. */
export function payrollProviderConfigured():boolean {
 const url=process.env.CHESS_PAYROLL_API_URL;
 const host=process.env.CHESS_PAYROLL_ALLOWED_HOST;
 const key=process.env.CHESS_PAYROLL_API_KEY;
 if(process.env.CHESS_PAYROLL_EXECUTION_ENABLED!=="true" || !url || !host || !key)return false;
 try {
  const parsed=new URL(url);
  return parsed.protocol==="https:" && parsed.hostname===host &&
   !parsed.username && !parsed.password && !parsed.hash;
 }catch{return false;}
}
export type PayrollSubmission={
 tenantId:string;entityId:string;payRunId:string;idempotencyKey:string;
 grossCents:string;netCents:string;taxCents:string;payDate:string;
};
export function payrollFingerprint(input:Omit<PayrollSubmission,"idempotencyKey">):string {
 return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export async function submitPayrollToProvider(input:PayrollSubmission) {
 if(!payrollProviderConfigured())throw new Error("Payroll vendor execution is disabled or misconfigured.");
 // Never retry automatically after uncertain network delivery.
 const responseRaw=await fetch(process.env.CHESS_PAYROLL_API_URL!,{
  method:"POST",
  headers:{
   "Authorization":`Bearer ${process.env.CHESS_PAYROLL_API_KEY!}`,
   "Content-Type":"application/json",
   "Idempotency-Key":input.idempotencyKey,
  },
  body:JSON.stringify(input),cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(15000),
 });
 if(!responseRaw.ok)throw new Error(`Provider failed with HTTP ${responseRaw.status}`);
 return response.parse(await responseRaw.json());
}

const providerStatusResponse=z.object({
 payRunId:z.string().min(1).max(128),
 providerRequestId:z.string().min(1).max(200).optional(),
 status:z.enum(["accepted","pending","paid","failed","rejected","unknown","not_found"]),
 observedAt:z.string().datetime(),
}).strict();

export function payrollStatusConfigured():boolean{
 if(process.env.CHESS_PAYROLL_STATUS_ENABLED!=="true"||
    process.env.CHESS_PAYROLL_PROVIDER_CERTIFIED!=="true")return false;
 const raw=process.env.CHESS_PAYROLL_STATUS_API_URL;
 const host=process.env.CHESS_PAYROLL_ALLOWED_HOST;
 const key=process.env.CHESS_PAYROLL_API_KEY;
 if(!raw||!host||!key)return false;
 try{
  const parsed=new URL(raw);
  return parsed.protocol==="https:"&&parsed.hostname===host&&
   !parsed.username&&!parsed.password&&!parsed.hash;
 }catch{return false;}
}

/** Read-only status lookup after payroll submission; no ACH, tax filing or
 * wage disbursement request is performed by this function. */
export async function getPayrollProviderStatus(input:{
 tenantId:string;entityId:string;payRunId:string;idempotencyKey:string;
 providerRequestId:string|null;
}){
 if(!payrollStatusConfigured())throw new Error("Payroll reconciliation is disabled.");
 const responseRaw=await fetch(process.env.CHESS_PAYROLL_STATUS_API_URL!,{
  method:"POST",headers:{
   "Authorization":`Bearer ${process.env.CHESS_PAYROLL_API_KEY!}`,
   "Content-Type":"application/json",
  },body:JSON.stringify(input),cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(15000),
 });
 if(!responseRaw.ok)throw new Error(`Payroll status lookup HTTP ${responseRaw.status}`);
 const reply=providerStatusResponse.parse(await responseRaw.json());
 if(reply.payRunId!==input.payRunId ||
   (input.providerRequestId&&reply.providerRequestId &&
    input.providerRequestId!==reply.providerRequestId))
  throw new Error("Payroll provider returned a status for a different run.");
 const observedAt=new Date(reply.observedAt);
 if(!Number.isFinite(observedAt.getTime())||
    observedAt.getTime()>Date.now()+5*60_000)
  throw new Error("Payroll provider status timestamp is invalid.");
 return {...reply,observedAt};
}
