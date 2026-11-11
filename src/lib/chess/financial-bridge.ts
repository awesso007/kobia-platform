import {z} from "zod";
import {db as legacyDb} from "@/lib/db";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError,getCurrentMembership} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {getClientServiceLink} from "@/lib/client-profile/service";

const input=z.object({
 businessId:z.string().min(1),clientProfileId:z.string().min(1),
 serviceCaseId:z.string().min(1),legacyEntityId:z.string().min(1),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL"]),
}).strict();

/** An explicit same-tenant mapping is required. Do not infer tenants or copy
 * GL/payroll data into the CHESS client CRM. */
export async function linkChessFinancialEntity(value:unknown) {
 const data=input.parse(value);
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if(!actor || !["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:update");
 const ctx=getTenantDb();
 const serviceCase=await ctx.db.chessServiceCase.findFirst({
  where:{id:data.serviceCaseId,businessId:data.businessId,clientProfileId:data.clientProfileId,
   service:data.service,status:{in:["REVIEW","ACTIVE"]}},
  select:{id:true},
 });
 if(!serviceCase)throw new PermissionError("record:update");
 const entity=await legacyDb.entity.findFirst({
  where:{id:data.legacyEntityId,tenantId:ctx.tenantId,isActive:true},select:{id:true,tenantId:true},
 });
 if(!entity)throw new PermissionError("record:update");
 return ctx.db.chessFinancialLink.create({data:{...data,legacyTenantId:ctx.tenantId},
  select:{id:true,businessId:true,service:true,legacyEntityId:true}});
}

/** Read-only operational counters. Permission is checked against BOTH the
 * active business and the explicitly granted service link. */
export async function financialOperationalSummary(businessId:string,clientProfileId:string,service:"ACCOUNTING"|"BOOKKEEPING"|"PAYROLL") {
 await assertBusinessAccess(businessId);
 const access=await getClientServiceLink(clientProfileId,businessId,service);
 if(!access)throw new PermissionError("record:read");
 const {db,tenantId}=getTenantDb();
 const mapping=await db.chessFinancialLink.findFirst({
  where:{businessId,clientProfileId,service,legacyTenantId:tenantId},
  select:{legacyEntityId:true},
 });
 if(!mapping)return {linked:false};
 const entity=await legacyDb.entity.findFirst({where:{id:mapping.legacyEntityId,tenantId,isActive:true},
  select:{id:true}});
 if(!entity)throw new PermissionError("record:read");
 if(service==="PAYROLL") {
  const [employees,payRuns]=await Promise.all([
   legacyDb.employee.count({where:{tenantId,entityId:entity.id,isActive:true}}),
   legacyDb.payRun.count({where:{tenantId,entityId:entity.id}}),
  ]);
  return {linked:true,service,employees,payRuns};
 }
 const [accounts,entries]=await Promise.all([
  legacyDb.account.count({where:{tenantId,entityId:entity.id,isActive:true}}),
  legacyDb.journalEntry.count({where:{tenantId,entityId:entity.id}}),
 ]);
 return {linked:true,service,accounts,entries};
}
