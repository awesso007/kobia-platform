import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {isUsableConsent} from "./onboarding";

/** Only business-unit aggregates. Never exposes ledger balances,
 * client identities, payroll employee pay or other business units. */
export async function getChessFinanceDashboard(businessId:string){
 await assertBusinessManager(businessId);
 const {db,tenantId}=getTenantDb();
 const tenant=await getTenantBySlug(tenantId);
 if(!tenant)throw new PermissionError("record:read");
 const [
  accountingCases,bookkeepingCases,payrollCases,taxCases,
  bankPending,bankStale,taxDraft,taxReviewed,taxApproved,
  payrollUnknown,payrollSubmitted,payrollProviderPaid,
  activeBankFeeds,
 ]=await Promise.all([
  db.chessServiceCase.count({where:{businessId,service:"ACCOUNTING",status:"ACTIVE"}}),
  db.chessServiceCase.count({where:{businessId,service:"BOOKKEEPING",status:"ACTIVE"}}),
  db.chessServiceCase.count({where:{businessId,service:"PAYROLL",status:"ACTIVE"}}),
  db.chessServiceCase.count({where:{businessId,service:"TAX",status:"ACTIVE"}}),
  db.chessBankReview.count({where:{businessId,legacyTenantId:tenant.id,status:"PENDING"}}),
  db.chessBankReview.count({where:{businessId,legacyTenantId:tenant.id,status:"STALE"}}),
  db.chessTaxWorkpaper.count({where:{businessId,legacyTenantId:tenant.id,status:"DRAFT"}}),
  db.chessTaxWorkpaper.count({where:{businessId,legacyTenantId:tenant.id,status:"REVIEWED"}}),
  db.chessTaxWorkpaper.count({where:{businessId,legacyTenantId:tenant.id,status:"APPROVED"}}),
  db.chessPayrollDispatch.count({where:{businessId,legacyTenantId:tenant.id,status:"UNKNOWN"}}),
  db.chessPayrollDispatch.count({where:{businessId,legacyTenantId:tenant.id,status:"SUBMITTED"}}),
  db.chessPayrollDispatch.count({where:{businessId,legacyTenantId:tenant.id,status:"PROVIDER_PAID"}}),
  db.chessBankFeedConnection.count({where:{businessId,legacyTenantId:tenant.id,active:true}}),
 ]);
 return {cases:{accounting:accountingCases,bookkeeping:bookkeepingCases,
  payroll:payrollCases,tax:taxCases},
  reviews:{bankPending,bankStale,taxDraft,taxReviewed,taxApproved},
  payroll:{unresolved:payrollUnknown,submitted:payrollSubmitted,
   vendorReportedPaid:payrollProviderPaid},
  bankFeed:{activeConnections:activeBankFeeds}};
}


export async function listChessAuthorizedFinanceCases(businessId:string){
 await assertBusinessManager(businessId);
 const {db}=getTenantDb();
 const records=await db.chessServiceCase.findMany({where:{
  businessId,status:"ACTIVE",
  service:{in:["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX"]},
 },select:{id:true,clientProfileId:true,service:true,status:true},
  orderBy:{createdAt:"desc"},take:100});
 const visible:typeof records=[];
 for(const row of records){
  try{
   const grant=await getClientServiceLink(row.clientProfileId,businessId,row.service);
   if(!grant)continue;
   const consent=await db.chessClientConsent.findMany({where:{
    businessId,clientProfileId:row.clientProfileId,purpose:`service:${row.service}`,
   },select:{status:true,expiresAt:true,consentedAt:true,acceptedByClerkUserId:true,
    verifiedEmailDigest:true,acceptanceEvidenceDigest:true}});
   if(consent.some(value=>isUsableConsent(value)))visible.push(row);
  }catch{/* No cross-client service-grant information escapes to the UI. */}
 }
 return visible;
}
