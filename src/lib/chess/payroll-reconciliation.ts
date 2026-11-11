import {db as ledger} from "@/lib/db";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {PermissionError,getCurrentMembership} from "@/lib/rbac/require-permission";
import {assertBusinessManager} from "./business-manager";
import {getPayrollProviderStatus,payrollStatusConfigured} from "./payroll-provider";

type Status="SUBMITTED"|"PROVIDER_PAID"|"PROVIDER_FAILED"|"UNKNOWN";
export function mapProviderPayrollStatus(
 provider:"accepted"|"pending"|"paid"|"failed"|"rejected"|"unknown"|"not_found",
):Status{
 if(provider==="paid")return "PROVIDER_PAID";
 if(provider==="failed"||provider==="rejected")return "PROVIDER_FAILED";
 if(provider==="accepted"||provider==="pending")return "SUBMITTED";
 return "UNKNOWN";
}
/** Reconcile only provider-submitted or uncertain runs. The remote status is
 * READ-ONLY and is never authority to run payroll or file taxes. */
export async function reconcileChessPayrollDispatches(now=new Date()){
 if(!payrollStatusConfigured())return {disabled:true,examined:0,updated:0,unresolved:0};
 const {db,tenantId}=getTenantDb();
 const legacyTenant=await getTenantBySlug(tenantId);
 if(!legacyTenant)throw new Error("Unrecognized finance tenant.");
 const stale=new Date(now.getTime()-2*60_000);
 await db.chessPayrollDispatch.updateMany({
  where:{status:"SUBMITTING",updatedAt:{lt:stale}},
  data:{status:"UNKNOWN",lastErrorCode:"SUBMISSION_UNCONFIRMED"},
 });
 const pending=await db.chessPayrollDispatch.findMany({where:{
  status:{in:["SUBMITTED","UNKNOWN"]},legacyTenantId:legacyTenant.id,
 },orderBy:{createdAt:"asc"},take:20});
 let updated=0,unresolved=0;
 for(const item of pending){
  const [business,run]=await Promise.all([
   db.chessBusinessUnit.findUnique({where:{id:item.businessId},select:{status:true}}),
   ledger.payRun.findFirst({where:{
    id:item.legacyPayRunId,entityId:item.legacyEntityId,tenantId:legacyTenant.id,
   },select:{status:true}}),
  ]);
  if(business?.status!=="ACTIVE"||run?.status!=="POSTED"){
   // A voided pay run is a compliance exception. Keep the last outcome
   // uncertain rather than silently overriding it.
   await db.chessPayrollDispatch.updateMany({where:{
    id:item.id,status:item.status,
   },data:{status:"UNKNOWN",lastErrorCode:"PAYRUN_OR_BUSINESS_CHANGED"}});
   unresolved++;
   continue;
  }
  try{
   const remote=await getPayrollProviderStatus({
    tenantId:legacyTenant.id,entityId:item.legacyEntityId,
    payRunId:item.legacyPayRunId,idempotencyKey:item.idempotencyKey,
    providerRequestId:item.providerRequestId,
   });
   // A stale status packet must never overwrite a more recent vendor
   // assertion. Submissions are never re-sent by this polling code.
   if((item.providerCheckedAt&&remote.observedAt<=item.providerCheckedAt)||
      (item.submittedAt&&remote.observedAt<item.submittedAt)){
    unresolved++;
    continue;
   }
   const status=mapProviderPayrollStatus(remote.status);
   await db.$transaction(async tx=>{
    const change=await tx.chessPayrollDispatch.updateMany({where:{
     id:item.id,status:item.status,updatedAt:item.updatedAt,
    },data:{status,providerCheckedAt:remote.observedAt,
     lastErrorCode:status==="UNKNOWN"?"PROVIDER_STATUS_UNRESOLVED":null}});
    if(change.count!==1)return;
    await tx.chessSecurityEvent.create({data:{
     businessId:item.businessId,action:"PAYROLL_STATUS_RECONCILED",
     resourceType:"ChessPayrollDispatch",resourceId:item.id,
     decision:status==="UNKNOWN"?"REVIEW":"ALLOW",
    }});
    updated++;
   });
   if(status==="UNKNOWN")unresolved++;
  }catch{
   // Read-only status requests may be repeated, but no payroll submission
   // is ever retried by this worker.
   unresolved++;
  }
 }
 return {disabled:false,examined:pending.length,updated,unresolved};
}
/** Administrative status listing exposes only run IDs and vendor assertions,
 * never employee wages, bank details or payroll PII. */
export async function listChessPayrollDispatches(businessId:string){
 await assertBusinessManager(businessId);
 const actor=await getCurrentMembership();
 if(!actor || actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return db.chessPayrollDispatch.findMany({where:{businessId},
  orderBy:{createdAt:"desc"},take:100,select:{
   id:true,legacyPayRunId:true,status:true,providerRequestId:true,
   createdAt:true,submittedAt:true,providerCheckedAt:true,
  }});
}
