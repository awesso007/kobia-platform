"use server";

/**
 * Round 56: historical bulk CRM operations previously authorized a whole
 * tenant before mutating unscoped IDs or exporting sensitive client PII.
 * Require every selected record to pass live ownership and client-service
 * grant checks in the SAME transaction as the mutation/export and audit.
 * Reject the entire batch on any denied record; never silently skip one.
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { ENTITY_TYPES, type EntityType } from "@/lib/crm/record";
import {
  withLegacyCrmTransaction, assertLegacyCrmRecord,
  verifyLegacyCrmCreateOwner, type LegacyCrmEntity,
} from "@/lib/chess/legacy-crm-security-round56";
import type { Prisma } from "@/lib/db/generated/tenant";

function asEntityType(value: string): LegacyCrmEntity {
  if (!ENTITY_TYPES.includes(value as EntityType))
    throw new PermissionError("record:read");
  return value as LegacyCrmEntity;
}
function idsFrom(value: string[]): string[] {
  if (!Array.isArray(value) || value.length > 100 ||
      value.some(v=>typeof v!=="string"||v.length>128))
    throw new PermissionError("record:read");
  return [...new Set(value.map(v=>v.trim()).filter(Boolean))];
}
function pathFor(entity: LegacyCrmEntity) {
  return "/app/" + { LEAD:"leads", DEAL:"deals", CONTACT:"contacts", COMPANY:"companies" }[entity];
}
async function actorId() {
  const m=await getCurrentMembership();
  if(!m||m.status!=="ACTIVE")throw new PermissionError("record:read");
  return m.clerkUserId;
}
async function assertEvery(tx:Prisma.TransactionClient,
  actor:Parameters<typeof assertLegacyCrmRecord>[1],
  entity:LegacyCrmEntity,ids:string[],
  operation:"record:read"|"record:update"|"record:delete"){
  for(const id of ids)
    await assertLegacyCrmRecord(tx,actor,entity,id,operation);
}
async function auditEach(tx:Prisma.TransactionClient,
  actor:Parameters<typeof assertLegacyCrmRecord>[1],
  entity:LegacyCrmEntity,ids:string[],action:string){
  for(const id of ids) await tx.chessSecurityEvent.create({data:{
    businessId:actor.businessId,actorClerkUserId:actor.id,
    action,resourceType:"Legacy"+entity,resourceId:id,decision:"ALLOW",
  }});
}
async function afterwards(entity:LegacyCrmEntity,ids:string[],deleted=false,notify=false){
  const {db}=getTenantDb();
  await Promise.allSettled(ids.map(async id=>{
    if(deleted)await removeFromIndex(db,entity,id);
    else{
      await reindex(db,entity,id);
      if(notify)await dispatchAutomation({
        type:"RECORD_UPDATED",entityType:entity,entityId:id,
      });
    }
  }));
  revalidatePath(pathFor(entity));
}
export async function bulkDelete(input:{entityType:string;ids:string[]}):Promise<number>{
  const entity=asEntityType(input.entityType),ids=idsFrom(input.ids);
  if(!ids.length)return 0;
  const user=await actorId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:delete",entity,"BULK",
    "LEGACY_CRM_BULK_DELETE",async(tx,actor)=>{
      await assertEvery(tx,actor,entity,ids,"record:delete");
      await auditEach(tx,actor,entity,ids,"LEGACY_CRM_BULK_DELETE_ITEM");
      switch(entity){
        case "LEAD": await tx.lead.deleteMany({where:{id:{in:ids}}});break;
        case "DEAL": await tx.deal.deleteMany({where:{id:{in:ids}}});break;
        case "CONTACT": {
          const linked=await tx.clientProfile.count({where:{contactId:{in:ids}}});
          if(linked)throw new PermissionError("record:delete");
          await tx.contact.deleteMany({where:{id:{in:ids}}});
          break;
        }
        case "COMPANY": await tx.company.deleteMany({where:{id:{in:ids}}});break;
      }
  });
  await afterwards(entity,ids,true);
  return ids.length;
}
export async function bulkAddTag(input:{entityType:string;ids:string[];tagId:string}):Promise<number>{
  const entity=asEntityType(input.entityType),ids=idsFrom(input.ids);
  if(!ids.length)return 0;
  const user=await actorId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:update",entity,"BULK",
    "LEGACY_CRM_BULK_ADD_TAG",async(tx,actor)=>{
      await assertEvery(tx,actor,entity,ids,"record:update");
      const tag=await tx.tag.findUnique({where:{id:input.tagId},select:{id:true}});
      if(!tag)throw new PermissionError("record:update");
      for(const entityId of ids)await tx.tagAssignment.upsert({
        where:{tagId_entityType_entityId:{tagId:tag.id,entityType:entity,entityId}},
        update:{},create:{tagId:tag.id,entityType:entity,entityId},
      });
      await auditEach(tx,actor,entity,ids,"LEGACY_CRM_BULK_ADD_TAG_ITEM");
  });
  await afterwards(entity,ids,false,true);
  return ids.length;
}
export async function bulkRemoveTag(input:{entityType:string;ids:string[];tagId:string}):Promise<number>{
  const entity=asEntityType(input.entityType),ids=idsFrom(input.ids);
  if(!ids.length)return 0;
  const user=await actorId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:update",entity,"BULK",
    "LEGACY_CRM_BULK_REMOVE_TAG",async(tx,actor)=>{
      await assertEvery(tx,actor,entity,ids,"record:update");
      if(typeof input.tagId!=="string"||!input.tagId||input.tagId.length>128)
        throw new PermissionError("record:update");
      await tx.tagAssignment.deleteMany({where:{
        tagId:input.tagId,entityType:entity,entityId:{in:ids},
      }});
      await auditEach(tx,actor,entity,ids,"LEGACY_CRM_BULK_REMOVE_TAG_ITEM");
  });
  await afterwards(entity,ids);
  return ids.length;
}
export async function bulkChangeOwner(input:{
  entityType:string;ids:string[];ownerUserId:string|null;
}):Promise<number>{
  const entity=asEntityType(input.entityType),ids=idsFrom(input.ids);
  if(!ids.length)return 0;
  const user=await actorId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:update",entity,"BULK",
    "LEGACY_CRM_BULK_REASSIGN",async(tx,actor)=>{
      await assertEvery(tx,actor,entity,ids,"record:update");
      const owner=await verifyLegacyCrmCreateOwner(
        tx,actor,input.ownerUserId?.trim()||null);
      const where={id:{in:ids}};
      switch(entity){
        case "LEAD":await tx.lead.updateMany({where,data:{ownerUserId:owner}});break;
        case "DEAL":await tx.deal.updateMany({where,data:{ownerUserId:owner}});break;
        case "CONTACT":await tx.contact.updateMany({where,data:{ownerUserId:owner}});break;
        case "COMPANY":await tx.company.updateMany({where,data:{ownerUserId:owner}});break;
      }
      await auditEach(tx,actor,entity,ids,"LEGACY_CRM_BULK_REASSIGN_ITEM");
  });
  await afterwards(entity,ids,false,true);
  return ids.length;
}
function csvCell(value:unknown):string{
  const raw=value==null?"":String(value);
  // Spreadsheet formula injection: tabs/whitespace before operators matter.
  const safe=/^[\s]*[=+\-@]/.test(raw)?"'"+raw:raw;
  return /[",\r\n]/.test(safe)?'"'+safe.replace(/"/g,'""')+'"':safe;
}
function csv(headers:string[],rows:(string|number|null)[][]):string{
  return [headers.map(csvCell).join(","),
    ...rows.map(row=>row.map(csvCell).join(","))].join("\n");
}
export async function bulkExportCsv(input:{entityType:string;ids:string[]}):Promise<string>{
  const entity=asEntityType(input.entityType),ids=idsFrom(input.ids);
  if(!ids.length)return "";
  const user=await actorId(),{db}=getTenantDb();
  return withLegacyCrmTransaction(db,user,"record:read",entity,"BULK_EXPORT",
    "LEGACY_CRM_BULK_EXPORT",async(tx,actor)=>{
      await assertEvery(tx,actor,entity,ids,"record:read");
      const where={id:{in:ids}};
      let output:string;
      switch(entity){
        case "LEAD":{
          const rows=await tx.lead.findMany({where,orderBy:{createdAt:"desc"}});
          output=csv(["Name","Email","Phone","Company","Source","Status","Owner","Created"],
            rows.map(r=>[r.name,r.email,r.phone,r.companyName,r.source,r.status,r.ownerUserId,r.createdAt.toISOString()]));
          break;
        }
        case "CONTACT":{
          const rows=await tx.contact.findMany({where,orderBy:{createdAt:"desc"}});
          output=csv(["First name","Last name","Email","Phone","Title","Owner","Created"],
            rows.map(r=>[r.firstName,r.lastName,r.email,r.phone,r.title,r.ownerUserId,r.createdAt.toISOString()]));
          break;
        }
        case "DEAL":{
          const rows=await tx.deal.findMany({where,orderBy:{createdAt:"desc"}});
          output=csv(["Name","Amount","Status","Owner","Created"],
            rows.map(r=>[r.name,(Number(r.amountCents)/100).toFixed(2),r.status,r.ownerUserId,r.createdAt.toISOString()]));
          break;
        }
        case "COMPANY":{
          const rows=await tx.company.findMany({where,orderBy:{createdAt:"desc"}});
          output=csv(["Name","Domain","Industry","Size","Phone","Owner","Created"],
            rows.map(r=>[r.name,r.domain,r.industry,r.size,r.phone,r.ownerUserId,r.createdAt.toISOString()]));
        }
      }
      await auditEach(tx,actor,entity,ids,"LEGACY_CRM_BULK_EXPORT_ITEM");
      return output;
    });
}
