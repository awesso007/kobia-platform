import {z} from "zod";
import {db as legacyDb} from "@/lib/db";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {isUsableConsent} from "./onboarding";
import {payrollFingerprint} from "./payroll-provider";

/**
 * The source digest used at approval creation and later execution MUST
 * be calculated from the same currently posted, mapped legacy pay run.
 * Never accept totals, pay dates, entity IDs or hashes from a browser.
 */
export const payrollSourceSchema=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 legacyPayRunId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128).optional(),
}).strict();

export function validPostedPayrollTotals(input:{
 totalGrossCents:bigint;totalNetCents:bigint;totalTaxesCents:bigint;
}):boolean{
 return input.totalGrossCents>0n&&input.totalNetCents>=0n&&
  input.totalTaxesCents>=0n&&
  input.totalNetCents+input.totalTaxesCents<=input.totalGrossCents;
}

export async function resolveChessPostedPayrollRun(input:unknown){
 const data=payrollSourceSchema.parse(input);
 await assertBusinessAccess(data.businessId);
 const grant=await getClientServiceLink(data.clientProfileId,data.businessId,"PAYROLL");
 if(!grant)throw new PermissionError("record:read");
 const {db,tenantId}=getTenantDb();
 const [serviceCases,consents]=await Promise.all([
  db.chessServiceCase.findMany({where:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   service:"PAYROLL",status:"ACTIVE",
   ...(data.serviceCaseId?{id:data.serviceCaseId}:{}),
  },select:{id:true}}),
  db.chessClientConsent.findMany({where:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   purpose:"service:PAYROLL",
  },select:{status:true,expiresAt:true,consentedAt:true,
   acceptedByClerkUserId:true,verifiedEmailDigest:true,
   acceptanceEvidenceDigest:true}}),
 ]);
 if(!serviceCases.length||!consents.some(c=>isUsableConsent(c)))
  throw new PermissionError("record:read");
 const legacyTenant=await getTenantBySlug(tenantId);
 if(!legacyTenant)throw new PermissionError("record:read");
 const mapping=await db.chessFinancialLink.findFirst({where:{
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  service:"PAYROLL",legacyTenantId:legacyTenant.id,
  serviceCaseId:{in:serviceCases.map(s=>s.id)},
 }});
 if(!mapping)throw new PermissionError("record:read");
 const run=await legacyDb.payRun.findFirst({where:{
  id:data.legacyPayRunId,entityId:mapping.legacyEntityId,
  tenantId:legacyTenant.id,status:"POSTED",
 },select:{id:true,tenantId:true,entityId:true,payDate:true,
  totalGrossCents:true,totalNetCents:true,totalTaxesCents:true}});
 if(!run||!validPostedPayrollTotals(run))
  throw new PermissionError("record:read");
 const payload={
  tenantId:run.tenantId,entityId:run.entityId,payRunId:run.id,
  grossCents:run.totalGrossCents.toString(),
  netCents:run.totalNetCents.toString(),
  taxCents:run.totalTaxesCents.toString(),payDate:run.payDate.toISOString(),
 };
 return {db,run,legacyTenant,payload,digest:payrollFingerprint(payload)};
}
