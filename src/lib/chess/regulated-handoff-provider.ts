import {z} from "zod";
import type {RegulatedService,RegulatedWorkflowKind} from "./regulated-policy";

const remote=z.object({
 workflowId:z.string().min(1).max(128),
 id:z.string().min(1).max(200).optional(),
 status:z.enum(["accepted","pending","rejected","not_found"]),
}).strict();
const services=["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"] as const;
const partnerKey=(service:RegulatedService)=>`CHESS_REGULATED_PARTNER_${service}`;
function permittedUrl(raw:string|undefined,host:string|undefined):boolean{
 if(!raw||!host)return false;
 try{
  const parsed=new URL(raw);
  return parsed.protocol==="https:"&&parsed.hostname===host&&
   !parsed.username&&!parsed.password&&!parsed.hash;
 }catch{return false;}
}
export function regulatedHandoffConfigured(service:RegulatedService):boolean{
 if(!services.includes(service)||process.env.CHESS_REGULATED_HANDOFF_ENABLED!=="true")
  return false;
 return !!process.env.CHESS_REGULATED_API_KEY&&
  !!process.env[partnerKey(service)]&&
  permittedUrl(process.env.CHESS_REGULATED_HANDOFF_API_URL,
   process.env.CHESS_REGULATED_ALLOWED_HOST)&&
  permittedUrl(process.env.CHESS_REGULATED_STATUS_API_URL,
   process.env.CHESS_REGULATED_ALLOWED_HOST);
}
export function handoffPartnerId(service:RegulatedService):string{
 if(!regulatedHandoffConfigured(service))throw new Error("Regulated handoff disabled.");
 const value=process.env[partnerKey(service)];
 if(!value||!/^[A-Za-z0-9_-]{4,128}$/.test(value))
  throw new Error("Partner identifier must be an approved opaque reference.");
 return value;
}
export type RegulatedSubmission={
 tenantSlug:string;businessId:string;serviceCaseId:string;workflowId:string;
 service:RegulatedService;kind:RegulatedWorkflowKind;
 idempotencyKey:string;partnerId:string;
};
async function post(url:string,payload:unknown,requestKey?:string){
 const response=await fetch(url,{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{"Authorization":`Bearer ${process.env.CHESS_REGULATED_API_KEY!}`,
   "Content-Type":"application/json",
   ...(requestKey?{"Idempotency-Key":requestKey}:{})},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(12000),
 });
 if(!response.ok)throw new Error(`Regulated gateway HTTP ${response.status}`);
 return remote.parse(await response.json());
}
/** This only creates an opaque case coordination ticket at a separately
 * authorized vendor. It cannot originate a loan, bind insurance, sign an
 * agency agreement, create an investment recommendation or place a trade. */
export async function submitRegulatedHandoff(input:RegulatedSubmission){
 if(!regulatedHandoffConfigured(input.service))throw new Error("Regulated handoff disabled.");
 const result=await post(process.env.CHESS_REGULATED_HANDOFF_API_URL!,input,input.idempotencyKey);
 if(result.workflowId!==input.workflowId||
  (result.status==="accepted"&&!result.id))
  throw new Error("Gateway acknowledgment did not match workflow.");
 return result;
}
export async function lookupRegulatedHandoff(input:{
 tenantSlug:string;businessId:string;serviceCaseId:string;workflowId:string;
 service:RegulatedService;idempotencyKey:string;providerRequestId:string|null;
}){
 if(!regulatedHandoffConfigured(input.service))throw new Error("Regulated status disabled.");
 const result=await post(process.env.CHESS_REGULATED_STATUS_API_URL!,{
  ...input,partnerId:handoffPartnerId(input.service),
 });
 if(result.workflowId!==input.workflowId||
  (input.providerRequestId && result.id && result.id!==input.providerRequestId) ||
  (result.status==="accepted"&&!result.id&&!input.providerRequestId))
  throw new Error("Gateway status does not match the original case.");
 return result;
}
