import {createHash} from "node:crypto";
import {z} from "zod";

export const triageInput=z.object({
 status:z.enum(["TODO","IN_PROGRESS","BLOCKED","COMPLETED","CANCELLED"]),
 dueBucket:z.enum(["OVERDUE","WITHIN_48_HOURS","LATER","UNSCHEDULED"]),
 hasAssignee:z.boolean(),
}).strict();
const triageResponse=z.object({
 priority:z.enum(["LOW","NORMAL","HIGH"]),
 recommendation:z.enum(["KEEP_QUEUE","REVIEW_DEADLINE","ESCALATE_TO_MANAGER"]),
 rationaleCode:z.enum([
  "DEADLINE_OVERDUE","DEADLINE_SOON","TASK_BLOCKED",
  "NO_ASSIGNEE","ORDINARY_QUEUE","TASK_CLOSED",
 ]),
 modelVersion:z.string().regex(/^[A-Za-z0-9._-]{2,80}$/),
}).strict();
export type TriageMetadata=z.infer<typeof triageInput>;
export type TriageResult=z.infer<typeof triageResponse>;
export function dueBucket(date:Date|null,now=new Date()):TriageMetadata["dueBucket"]{
 if(!date)return "UNSCHEDULED";
 if(date<=now)return "OVERDUE";
 if(date.getTime()-now.getTime()<=48*3600_000)return "WITHIN_48_HOURS";
 return "LATER";
}
export function workItemSourceDigest(input:{
 tenantId:string;businessId:string;id:string;status:string;
 updatedAt:Date;dueAt:Date|null;assignedClerkUserId:string|null;
}):string{
 return createHash("sha256").update(JSON.stringify({
  tenantId:input.tenantId,businessId:input.businessId,
  id:input.id,status:input.status,updatedAt:input.updatedAt.toISOString(),
  dueAt:input.dueAt?.toISOString()??null,
  assignedClerkUserId:input.assignedClerkUserId,
 })).digest("hex");
}
export function aiTriageConfigured():boolean{
 if(process.env.CHESS_AI_TRIAGE_ENABLED!=="true"||
    process.env.CHESS_AI_DATA_SHARING_APPROVED!=="true"||
    process.env.CHESS_AI_VENDOR_DPA_APPROVED!=="true"||
    process.env.CHESS_AI_COST_LIMIT_APPROVED!=="true")return false;
 const raw=process.env.CHESS_AI_TRIAGE_API_URL;
 const host=process.env.CHESS_AI_ALLOWED_HOST;
 const key=process.env.CHESS_AI_API_KEY;
 if(!raw||!host||!key)return false;
 try{
  const u=new URL(raw);
  return u.protocol==="https:"&&u.hostname===host&&
   !u.username&&!u.password&&!u.hash&&!u.port;
 }catch{return false;}
}
/** Safe classifications, not instructions. Never trust the model with
 * execution rights, record-level IDs or unredacted client/task text. */
export function validateTriageOutput(raw:unknown,input:TriageMetadata):TriageResult{
 const result=triageResponse.parse(raw);
 if(["COMPLETED","CANCELLED"].includes(input.status)){
  if(result.priority!=="LOW"||result.recommendation!=="KEEP_QUEUE"||
   result.rationaleCode!=="TASK_CLOSED")
   throw new Error("Model returned unsafe action for a closed task.");
 }
 if(input.status==="BLOCKED"&&result.recommendation!=="ESCALATE_TO_MANAGER")
  throw new Error("Blocked work must be escalated to a human manager.");
 if(input.dueBucket==="OVERDUE"&&result.priority==="LOW"&&
  !["COMPLETED","CANCELLED"].includes(input.status))
  throw new Error("Overdue active work cannot receive LOW priority.");
 return result;
}
export const AI_TRIAGE_MAX_TOKENS=128;
export const AI_TRIAGE_MAX_RESPONSE_BYTES=2048;
export const AI_TRIAGE_MAX_COST_MICROS=5000;
/** Provider is contractually required to enforce token and per-call billing
 * bounds. These request values do not prove the provider's actual charges.
 * If a mandatory usage header is absent or exceeds the cap, reject advice. */
export function approvedAiUsage(raw:string|null):number{
 if(!raw||!/^([0-9]|[1-9][0-9]{1,8})$/.test(raw))
  throw new Error("Provider AI cost evidence absent or malformed.");
 const micros=Number(raw);
 if(!Number.isSafeInteger(micros)||micros>AI_TRIAGE_MAX_COST_MICROS)
  throw new Error("Provider AI cost exceeded approved request cap.");
 return micros;
}
export async function requestChessAiTriage(input:TriageMetadata):Promise<TriageResult>{
 const validated=triageInput.parse(input);
 if(!aiTriageConfigured())throw new Error("AI triage is disabled.");
 const response=await fetch(process.env.CHESS_AI_TRIAGE_API_URL!,{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{"Authorization":`Bearer ${process.env.CHESS_AI_API_KEY!}`,
   "Content-Type":"application/json"},
  body:JSON.stringify({purpose:"WORK_ITEM_TRIAGE_V1",features:validated,
   constraints:{maxOutputTokens:AI_TRIAGE_MAX_TOKENS,
    maxCostMicros:AI_TRIAGE_MAX_COST_MICROS,retainInput:false,
    permitToolCalls:false}}),
  signal:AbortSignal.timeout(12000),
 });
 if(!response.ok)throw new Error(`AI gateway returned HTTP ${response.status}`);
 approvedAiUsage(response.headers.get("x-chess-ai-cost-micros"));
 const bytes=Number(response.headers.get("content-length"));
 if(Number.isFinite(bytes)&&bytes>AI_TRIAGE_MAX_RESPONSE_BYTES)
  throw new Error("AI provider response exceeds safe output cap.");
 const value:unknown=await response.json();
 const serialized=JSON.stringify(value);
 if(serialized.length>AI_TRIAGE_MAX_RESPONSE_BYTES)
  throw new Error("AI provider output size cap exceeded.");
 return validateTriageOutput(value,validated);
}
