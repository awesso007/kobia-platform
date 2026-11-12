/**
 * Sensitive legacy KOBIA tax exports (separate from CHESS tenant services).
 *
 * Keep role, active tenant, active entity, SELECT and audit insertion in one
 * SERIALIZABLE legacy Postgres transaction. A failed audit insert fails closed.
 * Only owner/admin/accountant may download vendor tax IDs; generic tenant
 * membership or read-only CRM access is not sufficient.
 *
 * This is a legacy AuditLog entry, not proof of WORM/immutable external archive.
 */
import type {Prisma} from "@prisma/client";
import type {AuthContext} from "@/lib/auth";
import {db} from "@/lib/db";

export type LegacyTaxExportEntity={id:string;name:string};
export type LegacyTaxForm="1099_NEC"|"1099_MISC";

export async function auditedLegacyTaxExport<T>(
 auth:AuthContext,
 entityId:string,
 form:LegacyTaxForm,
 read:(tx:Prisma.TransactionClient,entity:LegacyTaxExportEntity)=>Promise<T>,
 database:typeof db=db,
):Promise<{entity:LegacyTaxExportEntity;data:T}|null>{
 return database.$transaction(async tx=>{
  const [tenant,membership,entity]=await Promise.all([
   tx.tenant.findUnique({where:{id:auth.tenant.id},select:{isActive:true}}),
   tx.membership.findUnique({where:{userId_tenantId:{
    userId:auth.user.id,tenantId:auth.tenant.id,
   }},select:{isActive:true,role:true}}),
   tx.entity.findFirst({where:{
    id:entityId,tenantId:auth.tenant.id,isActive:true,
   },select:{id:true,name:true}}),
  ]);
  const allowed=tenant?.isActive===true&&membership?.isActive===true&&
   (membership.role==="OWNER"||membership.role==="ADMIN"||
    membership.role==="ACCOUNTANT")&&!!entity;
  // Never query the vendor table when a role was revoked, or when an entity
  // belongs to a different tenant. Never place taxpayer PII in audit metadata.
  const data=allowed ? await read(tx,entity) : null;
  await tx.auditLog.create({data:{
   tenantId:auth.tenant.id,userId:auth.user.id,
   action:form==="1099_NEC"?"sensitive.export.1099_nec":"sensitive.export.1099_misc",
   entityType:"Entity",entityId:entity?.id??null,
   metadata:{decision:allowed?"ALLOW":"DENY",form},
  }});
  return allowed ? {entity:entity!,data:data as T} : null;
 },{isolationLevel:"Serializable"});
}

/** A strict four-digit tax-year boundary: avoid NaN, fractions and extremes. */
export function parseLegacyTaxYear(value:string|null,now=new Date()):number|null{
 if(value===null)return now.getUTCFullYear();
 if(!/^\\d{4}$/.test(value))return null;
 const year=Number(value);
 return year>=1900&&year<=9998?year:null;
}
