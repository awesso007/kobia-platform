import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {requestChessAiTriage,workItemSourceDigest,dueBucket} from "./ai-triage-provider";

const ids=z.object({businessId:z.string().min(1).max(128),
 workItemId:z.string().min(1).max(128)}).strict();
const decisionInput=ids.extend({
 suggestionId:z.string().min(1).max(128),
 decision:z.enum(["ACCEPTED","REJECTED"]),
 expectedUpdatedAt:z.string().datetime(),
}).strict();
export function independentAiReview(requester:string,reviewer:string,role:string):boolean{
 return requester!==reviewer&&["OWNER","ADMIN"].includes(role);
}
export async function suggestChessWorkItemTriage(input:unknown){
 const data=ids.parse(input);
 const actor=await assertBusinessManager(data.businessId);
 const {db,tenantId}=getTenantDb();
 const item=await db.chessWorkItem.findFirst({
  where:{id:data.workItemId,businessId:data.businessId},
  select:{id:true,businessId:true,status:true,updatedAt:true,
   dueAt:true,assignedClerkUserId:true},
 });
 if(!item)throw new PermissionError("record:read");
 const digest=workItemSourceDigest({...item,tenantId});
 const prior=await db.chessAiSuggestion.findUnique({where:{
  workItemId_sourceDigest:{workItemId:item.id,sourceDigest:digest},
 },select:{id:true,status:true,priority:true,recommendation:true,rationaleCode:true}});
 if(prior)return prior;
 const advice=await requestChessAiTriage({
  status:item.status,dueBucket:dueBucket(item.dueAt),
  hasAssignee:!!item.assignedClerkUserId,
 });
 // Remote AI may respond after the task changed: do not write stale advice.
 const fresh=await db.chessWorkItem.findFirst({where:{
  id:item.id,businessId:data.businessId,
 },select:{id:true,businessId:true,status:true,updatedAt:true,
  dueAt:true,assignedClerkUserId:true}});
 if(!fresh||workItemSourceDigest({...fresh,tenantId})!==digest)
  throw new PermissionError("record:update");
 return db.$transaction(async tx=>{
  const result=await tx.chessAiSuggestion.create({data:{
   businessId:data.businessId,workItemId:item.id,sourceDigest:digest,
   priority:advice.priority,recommendation:advice.recommendation,
   rationaleCode:advice.rationaleCode,modelVersion:advice.modelVersion,
   requestedByClerkUserId:actor.clerkUserId,
  },select:{id:true,status:true,priority:true,recommendation:true,rationaleCode:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"AI_WORK_TRIAGE_SUGGESTED",resourceType:"ChessAiSuggestion",
   resourceId:result.id,decision:"REVIEW",
  }});
  return result;
 });
}
export async function reviewChessWorkItemTriage(input:unknown){
 const data=decisionInput.parse(input);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:update");
 await assertBusinessManager(data.businessId);
 const {db,tenantId}=getTenantDb();
 const suggestion=await db.chessAiSuggestion.findFirst({where:{
  id:data.suggestionId,businessId:data.businessId,
  workItemId:data.workItemId,status:"PENDING",
 }});
 if(!suggestion||!independentAiReview(suggestion.requestedByClerkUserId,
  actor.clerkUserId,actor.role)||
  suggestion.updatedAt.getTime()!==new Date(data.expectedUpdatedAt).getTime())
  throw new PermissionError("record:update");
 const item=await db.chessWorkItem.findFirst({where:{
  id:data.workItemId,businessId:data.businessId,
 },select:{id:true,businessId:true,status:true,updatedAt:true,
  dueAt:true,assignedClerkUserId:true}});
 const currentDigest=item?workItemSourceDigest({...item,tenantId}):null;
 const next=currentDigest===suggestion.sourceDigest?data.decision:"STALE";
 return db.$transaction(async tx=>{
  const changed=await tx.chessAiSuggestion.updateMany({where:{
   id:suggestion.id,businessId:data.businessId,status:"PENDING",
   updatedAt:suggestion.updatedAt,
  },data:{status:next,reviewedByClerkUserId:actor.clerkUserId,
   reviewedAt:new Date()}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"AI_WORK_TRIAGE_"+next,resourceType:"ChessAiSuggestion",
   resourceId:suggestion.id,decision:next==="ACCEPTED"?"ALLOW":"REVIEW",
  }});
  return {id:suggestion.id,status:next,taskModified:false};
 });
}
export async function listChessWorkItemTriage(businessId:string){
 await assertBusinessManager(businessId);
 const {db}=getTenantDb();
 return db.chessAiSuggestion.findMany({where:{businessId},
  orderBy:{createdAt:"desc"},take:100,select:{
   id:true,workItemId:true,priority:true,recommendation:true,rationaleCode:true,
   modelVersion:true,status:true,createdAt:true,updatedAt:true,
  }});
}
