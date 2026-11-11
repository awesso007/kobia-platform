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
