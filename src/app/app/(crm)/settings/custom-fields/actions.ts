"use server";

/*
 * Custom-field server actions. Field definitions are tenant-scoped (one set per
 * tenant), so all DB access goes through getTenantDb(). setCustomFieldValue is
 * called by entity create/edit forms (Leads/Deals/Contacts/Companies) to upsert
 * a single value.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";
import { writeLegacyCrmMetadata } from "@/lib/chess/legacy-crm-metadata-round56";
import {
  CUSTOM_FIELD_TYPES,
  ENTITY_TYPES,
  type CustomFieldType,
  type EntityType,
} from "@/lib/crm/record";

function asEntityType(v: unknown): EntityType {
  if(!ENTITY_TYPES.includes(v as EntityType))throw new PermissionError("customfield:manage");
  return v as EntityType;
}
function asFieldType(v: unknown): CustomFieldType {
  if(!CUSTOM_FIELD_TYPES.includes(v as CustomFieldType))throw new PermissionError("customfield:manage");
  return v as CustomFieldType;
}

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "field";
}

export type CustomFieldInput = {
  entityType: string;
  label: string;
  key?: string;
  type: string;
  options?: string[];
  required?: boolean;
};

async function customManager() {
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("customfield:manage");
 return actor.clerkUserId;
}
export async function createCustomField(input:CustomFieldInput) {
 const label=input.label?.trim();
 if(!label||label.length>200)throw Error("Invalid custom field name");
 const user=await customManager(),{db}=getTenantDb();
 const entityType=asEntityType(input.entityType),type=asFieldType(input.type);
 const key=slugifyKey(input.key?.trim()||label);
 const options=(type==="SELECT"||type==="MULTI_SELECT")?
  (input.options??[]).map(x=>x.trim()).filter(Boolean):[];
 if(options.length>100||options.some(x=>x.length>200))
  throw new PermissionError("customfield:manage");
 const id=await withLegacyCrmTransaction(db,user,"customfield:manage",
  entityType,"NEW_FIELD","LEGACY_CUSTOMFIELD_CREATED",async tx=>{
  const max=await tx.customField.aggregate({where:{entityType},_max:{order:true}});
  const field=await tx.customField.create({data:{
   entityType,key,label,type,required:Boolean(input.required),
   order:(max._max.order??-1)+1,options:options as never,
  },select:{id:true}});
  return field.id;
 });
 revalidatePath("/app/settings/custom-fields");
 return id;
}
export async function updateCustomField(id:string,input:CustomFieldInput) {
 const label=input.label?.trim();
 if(!label||label.length>200)throw Error("Invalid field label");
 const user=await customManager(),{db}=getTenantDb();
 const type=asFieldType(input.type);
 const options=(type==="SELECT"||type==="MULTI_SELECT")?
  (input.options??[]).map(x=>x.trim()).filter(Boolean):[];
 if(options.length>100||options.some(x=>x.length>200))
  throw new PermissionError("customfield:manage");
 await withLegacyCrmTransaction(db,user,"customfield:manage",
  "LEAD",id,"LEGACY_CUSTOMFIELD_UPDATED",async tx=>{
   await tx.customField.update({
    where:{id},data:{label,type,required:Boolean(input.required),
      options:options as never},
   });
 });
 revalidatePath("/app/settings/custom-fields");
}
export async function deleteCustomField(id:string) {
 const user=await customManager(),{db}=getTenantDb();
 await withLegacyCrmTransaction(db,user,"customfield:manage",
  "LEAD",id,"LEGACY_CUSTOMFIELD_DELETED",async tx=>{
   await tx.customField.delete({where:{id}});
 });
 revalidatePath("/app/settings/custom-fields");
}
export async function reorderCustomFields(entityType:string,orderedIds:string[]) {
 const et=asEntityType(entityType);
 if(!Array.isArray(orderedIds)||orderedIds.length>250||
  orderedIds.some(x=>typeof x!=="string"||!x||x.length>128)||
  new Set(orderedIds).size!==orderedIds.length)
  throw new PermissionError("customfield:manage");
 const user=await customManager(),{db}=getTenantDb();
 await withLegacyCrmTransaction(db,user,"customfield:manage",
  et,"REORDER","LEGACY_CUSTOMFIELDS_REORDERED",async tx=>{
  const rows=await tx.customField.findMany({
   where:{entityType:et},select:{id:true},take:251,
  });
  if(rows.length!==orderedIds.length||
     orderedIds.some(id=>!rows.some(x=>x.id===id)))
   throw new PermissionError("customfield:manage");
  for(let i=0;i<orderedIds.length;i++){
   await tx.customField.update({
    where:{id:orderedIds[i]!},data:{order:i},
   });
  }
 });
 revalidatePath("/app/settings/custom-fields");
}

/**
 * Upsert a single custom-field value for an entity record. value is the raw JSON
 * the field type expects (string, number, boolean, or string[]). A null/empty
 * value deletes the row.
 */
export async function setCustomFieldValue(input: {
  customFieldId: string; entityType: string; entityId: string; value: unknown;
}) {
  // Direct server action, not a trusted helper. Verify parent and definition.
  if (!ENTITY_TYPES.includes(input.entityType as EntityType))
    throw new PermissionError("record:update");
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:update");
  const entity = input.entityType as EntityType;
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, member.clerkUserId, "record:update",
    entity, input.entityId, "LEGACY_CRM_FIELD_UPDATED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, entity, input.entityId, "record:update");
      await writeLegacyCrmMetadata(tx, entity, input.entityId, {
        customFields: { [input.customFieldId]: input.value },
      });
    });
}

/**
 * Do not expose a custom-field-value write bypass through a directly callable
 * server action. All row/field/grant/actor checks and the security event share
 * one transaction. An unknown field or a revoked client permission fails closed.
 */
export async function saveCustomFieldValues(input: {
  entityType: string; entityId: string; values: Record<string, unknown>;
}) {
  if (!ENTITY_TYPES.includes(input.entityType as EntityType))
    throw new PermissionError("record:update");
  const member = await getCurrentMembership();
  if (!member || member.status !== "ACTIVE") throw new PermissionError("record:update");
  const entity = input.entityType as EntityType;
  const { db } = getTenantDb();
  await withLegacyCrmTransaction(db, member.clerkUserId, "record:update",
    entity, input.entityId, "LEGACY_CRM_FIELDS_UPDATED", async (tx, actor) => {
      await assertLegacyCrmRecord(tx, actor, entity, input.entityId, "record:update");
      await writeLegacyCrmMetadata(tx, entity, input.entityId, {
        customFields: input.values,
      });
    });
}
