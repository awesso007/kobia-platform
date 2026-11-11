import {getTenantDb} from "@/lib/db/get-tenant-db";
import {aiTriageConfigured,dueBucket,requestChessAiTriage,
 workItemSourceDigest} from "./ai-triage-provider";

/** Tenant-allowlisted scheduler creates pending, non-executing suggestions.
 * It has no capability to modify a task, charge a client, or post a journal.
 * Input sent to the AI is limited to status, due bucket and assignment flag. */
export async function runChessAiTriage(now=new Date()){
 if(process.env.CHESS_AI_TRIAGE_ENABLED!=="true"||
  process.env.CHESS_SCHEDULER_ENABLED!=="true"||
  !aiTriageConfigured())
  return {disabled:true,examined:0,generated:0,blocked:0};
 const {db,tenantId}=getTenantDb();
 const tasks=await db.chessWorkItem.findMany({where:{
  status:{in:["TODO","IN_PROGRESS","BLOCKED"]},
 },orderBy:{updatedAt:"desc"},take:200,
  select:{id:true,businessId:true,status:true,updatedAt:true,
   dueAt:true,assignedClerkUserId:true}});
 let generated=0,blocked=0,examined=0;
 const businesses=new Map<string,boolean>();
 for(const task of tasks){
  if(examined>=25)break;
  let active=businesses.get(task.businessId);
  if(active===undefined){
   const unit=await db.chessBusinessUnit.findUnique({where:{id:task.businessId},
    select:{status:true}});
   active=unit?.status==="ACTIVE";
   businesses.set(task.businessId,active);
  }
  if(!active)continue;
  const sourceDigest=workItemSourceDigest({...task,tenantId});
  const duplicate=await db.chessAiSuggestion.findUnique({where:{
   workItemId_sourceDigest:{workItemId:task.id,sourceDigest},
  },select:{id:true}});
  if(duplicate)continue;
  examined++;
  try{
   const proposal=await requestChessAiTriage({
    status:task.status,dueBucket:dueBucket(task.dueAt,now),
    hasAssignee:!!task.assignedClerkUserId,
   });
   const fresh=await db.chessWorkItem.findFirst({where:{
    id:task.id,businessId:task.businessId,
   },select:{id:true,businessId:true,status:true,updatedAt:true,
    dueAt:true,assignedClerkUserId:true}});
   if(!fresh||workItemSourceDigest({...fresh,tenantId})!==sourceDigest){
    blocked++;
    continue;
   }
   await db.$transaction(async tx=>{
    const suggestion=await tx.chessAiSuggestion.create({data:{
     businessId:task.businessId,workItemId:task.id,sourceDigest,
     priority:proposal.priority,recommendation:proposal.recommendation,
     rationaleCode:proposal.rationaleCode,modelVersion:proposal.modelVersion,
     requestedByClerkUserId:"SYSTEM_AI_TRIAGE",
    },select:{id:true}});
    await tx.chessSecurityEvent.create({data:{
     businessId:task.businessId,action:"AI_TRIAGE_WORKER_SUGGESTED",
     resourceType:"ChessAiSuggestion",resourceId:suggestion.id,decision:"REVIEW",
    }});
   });
   generated++;
  }catch{
   blocked++;
  }
 }
 return {disabled:false,examined,generated,blocked};
}
