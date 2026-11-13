"use server";

/**
 * Round 56: CRM Activity writes previously had no role check and could
 * associate an arbitrary client's record. Bind both previous and requested
 * related records, activity ownership and current ClientServiceGrant to the
 * same audited serializable transaction. No unaudited orphan writes.
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { ACTIVITY_TYPES, type ActivityKind } from "@/lib/crm/record";
import {
  withLegacyCrmTransaction, assertLegacyCrmRecord,
  verifyLegacyCrmCreateOwner, type LegacyCrmEntity, type LegacyTx,
} from "@/lib/chess/legacy-crm-security-round56";
import type { LeadActor } from "@/lib/chess/legacy-lead-security-round54";
const RELATED=["LEAD","DEAL","CONTACT","COMPANY"] as const;
export type ActivityInput={
  type:string;subject:string;body?:string;dueAt?:string|null;
  ownerClerkUserId?:string|null;relatedType?:string|null;relatedId?:string|null;
};
function parse(input:ActivityInput) {
  if(!input||typeof input.subject!=="string"||
     !input.subject.trim()||input.subject.length>200||
     (input.body!==undefined&&
      (typeof input.body!=="string"||input.body.length>4000)))
    throw new Error("Invalid activity.");
  const due=input.dueAt?new Date(input.dueAt):null;
  if(due&&!Number.isFinite(due.getTime()))throw Error("Invalid due date.");
  const type=ACTIVITY_TYPES.includes(input.type as ActivityKind)
    ? input.type as ActivityKind : "TASK" as const;
  let related: {entity:LegacyCrmEntity;id:string}|null=null;
  if(input.relatedType||input.relatedId){
    const e=input.relatedType?.toUpperCase() as LegacyCrmEntity|undefined;
    if(!e||!RELATED.includes(e)||!input.relatedId||
       input.relatedId.length>128)throw new PermissionError("activity:create");
    related={entity:e,id:input.relatedId};
  }
  return {subject:input.subject.trim(),body:input.body?.trim()||null,
    dueAt:due,type,related,owner:input.ownerClerkUserId?.trim()||null};
}
async function userId(){
  const m=await getCurrentMembership();
  if(!m||m.status!=="ACTIVE")throw new PermissionError("activity:create");
  return m.clerkUserId;
}
function currentRef(row:{
  leadId:string|null;dealId:string|null;
  contactId:string|null;companyId:string|null;
}):{entity:LegacyCrmEntity;id:string}|null{
  if(row.leadId)return{entity:"LEAD",id:row.leadId};
  if(row.dealId)return{entity:"DEAL",id:row.dealId};
  if(row.contactId)return{entity:"CONTACT",id:row.contactId};
  if(row.companyId)return{entity:"COMPANY",id:row.companyId};
  return null;
}
async function canChange(tx:LegacyTx,actor:LeadActor,row:{
  ownerClerkUserId:string|null;leadId:string|null;dealId:string|null;
  contactId:string|null;companyId:string|null;
}){
  if(actor.role==="MEMBER"&&row.ownerClerkUserId!==actor.id)
    throw new PermissionError("record:update");
  const old=currentRef(row);
  if(old)await assertLegacyCrmRecord(tx,actor,old.entity,old.id,"record:update");
}
async function afterCommit(id:string,action:"RECORD_CREATED"|"RECORD_UPDATED"|"FIELD_CHANGED",
  changed=false){
  const {db}=getTenantDb();
  await Promise.allSettled([
    dispatchAutomation({type:action,entityType:"ACTIVITY",entityId:id,
      ...(changed?{changedFields:["completedAt"]}:{})}),
    reindex(db,"ACTIVITY",id),
  ]);
  revalidatePath("/app/activities");
}
export async function createActivity(input:ActivityInput){
  const parsed=parse(input),user=await userId(),{db}=getTenantDb();
  const id=await withLegacyCrmTransaction(db,user,"activity:create",
    "LEAD","NEW_ACTIVITY","LEGACY_ACTIVITY_CREATED",async(tx,actor)=>{
      if(parsed.related)await assertLegacyCrmRecord(tx,actor,parsed.related.entity,
        parsed.related.id,"record:update");
      const owner=await verifyLegacyCrmCreateOwner(tx,actor,parsed.owner);
      const row=await tx.crmActivity.create({data:{
        type:parsed.type,subject:parsed.subject,body:parsed.body,dueAt:parsed.dueAt,
        ownerClerkUserId:owner??actor.id,createdByUserId:actor.id,
        ...(parsed.related?({
          [{LEAD:"leadId",DEAL:"dealId",CONTACT:"contactId",COMPANY:"companyId"}[parsed.related.entity]]:
            parsed.related.id,
        }):{}),
      },select:{id:true}});
      return row.id;
    });
  await afterCommit(id,"RECORD_CREATED");
  return id;
}
export async function updateActivity(id:string,input:ActivityInput){
  const parsed=parse(input),user=await userId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:read",
    "LEAD",id,"LEGACY_ACTIVITY_UPDATED",async(tx,actor)=>{
      const before=await tx.crmActivity.findUnique({where:{id}});
      if(!before)throw new PermissionError("record:update");
      await canChange(tx,actor,before);
      if(parsed.related)await assertLegacyCrmRecord(tx,actor,
        parsed.related.entity,parsed.related.id,"record:update");
      const owner=await verifyLegacyCrmCreateOwner(tx,actor,
        parsed.owner??before.ownerClerkUserId);
      const fk={leadId:null,dealId:null,contactId:null,companyId:null};
      if(parsed.related){
        const col={LEAD:"leadId",DEAL:"dealId",CONTACT:"contactId",
          COMPANY:"companyId"}[parsed.related.entity];
        fk[col]=parsed.related.id as never;
      }
      await tx.crmActivity.update({where:{id},data:{
        ...fk,type:parsed.type,subject:parsed.subject,
        body:parsed.body,dueAt:parsed.dueAt,ownerClerkUserId:owner,
      }});
    });
  await afterCommit(id,"RECORD_UPDATED");
}
export async function setActivityComplete(id:string,complete:boolean){
  if(typeof complete!=="boolean")throw Error("Invalid completion.");
  const user=await userId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:read",
    "LEAD",id,"LEGACY_ACTIVITY_COMPLETION_CHANGED",async(tx,actor)=>{
      const before=await tx.crmActivity.findUnique({where:{id}});
      if(!before)throw new PermissionError("record:update");
      await canChange(tx,actor,before);
      await tx.crmActivity.update({where:{id},
        data:{completedAt:complete?new Date():null}});
    });
  await afterCommit(id,"FIELD_CHANGED",true);
}
export async function deleteActivity(id:string){
  const user=await userId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:delete",
    "LEAD",id,"LEGACY_ACTIVITY_DELETED",async(tx,actor)=>{
      const before=await tx.crmActivity.findUnique({where:{id}});
      if(!before)throw new PermissionError("record:delete");
      await canChange(tx,actor,before);
      await tx.crmActivity.delete({where:{id}});
    });
  await removeFromIndex(db,"ACTIVITY",id).catch(()=>undefined);
  revalidatePath("/app/activities");
}
