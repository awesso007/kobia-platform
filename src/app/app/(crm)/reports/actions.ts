"use server";

/**
 * Round 57: saved reports are sensitive, directly callable server actions,
 * not unaudited tenant settings. OWNER/ADMIN may edit only within the live
 * single-business legacy scope. The write and immutable event commit in
 * one SERIALIZABLE transaction. Preview is denied where a report could
 * aggregate across CHESS client grants (until per-client SQL filtering).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction } from "@/lib/chess/legacy-crm-security-round56";
import { REPORT_ENTITIES, type ReportDefinition } from "@/lib/reports/types";
import type { AutomationEntityKind } from "@/lib/automations/types";
import type { PrismaClient } from "@/lib/db/generated/tenant";

function sanitize(def:ReportDefinition):ReportDefinition {
 if(!def||typeof def!=="object"||
    !REPORT_ENTITIES.includes(def.entity) ||
    !Array.isArray(def.columns)||def.columns.length>50||
    !Array.isArray(def.filters)||def.filters.length>50)
  throw new PermissionError("report:run");
 const entity:AutomationEntityKind=def.entity;
 return {
  entity,columns:def.columns,filters:def.filters,
  groupBy:def.groupBy??null,aggregation:def.aggregation??"count",
  aggregateField:def.aggregateField??null,chart:def.chart??"none",
 };
}
async function actorId(){
 const member=await getCurrentMembership();
 if(!member||member.status!=="ACTIVE")throw new PermissionError("report:manage");
 return member.clerkUserId;
}
export async function saveReport(input:{name:string;definition:ReportDefinition}){
 const name=input?.name?.trim();
 if(!name||name.length>200)throw new Error("Invalid report name");
 const def=sanitize(input.definition),actor=await actorId(),{db}=getTenantDb();
 const id=await withLegacyCrmTransaction(db,actor,"report:manage","DEAL",
  "NEW_REPORT","LEGACY_REPORT_CREATED",async tx=>{
   const row=await tx.savedReport.create({
    data:{name,definition:def as never},select:{id:true},
   });return row.id;
  });
 revalidatePath("/app/reports");return id;
}
export async function updateReport(id:string,input:{name:string;definition:ReportDefinition}){
 const name=input?.name?.trim();
 if(!name||name.length>200)throw new Error("Invalid report name");
 const def=sanitize(input.definition),actor=await actorId(),{db}=getTenantDb();
 await withLegacyCrmTransaction(db,actor,"report:manage","DEAL",id,
  "LEGACY_REPORT_UPDATED",async tx=>{
   await tx.savedReport.update({where:{id},data:{
    name,definition:def as never,
   }});
  });
 revalidatePath("/app/reports");revalidatePath("/app/reports/builder");
}
export async function deleteReport(id:string){
 const actor=await actorId(),{db}=getTenantDb();
 await withLegacyCrmTransaction(db,actor,"report:manage","DEAL",id,
  "LEGACY_REPORT_DELETED",async tx=>{
   await tx.savedReport.delete({where:{id}});
  });
 revalidatePath("/app/reports");
}
export async function previewReport(definition:ReportDefinition){
 const def=sanitize(definition),actor=await actorId(),{db}=getTenantDb();
 const {runReport}=await import("./queries");
 return withLegacyCrmTransaction(db,actor,"report:run","DEAL",
  "PREVIEW","LEGACY_REPORT_PREVIEW_READ",async tx=>{
   // Legacy report SQL has no ClientServiceGrant association. Until explicit
   // client-level report filters exist, refuse any protected client aggregate.
   if(await tx.clientProfile.count())throw new PermissionError("report:run");
   return runReport(def,tx as unknown as PrismaClient);
  });
}
