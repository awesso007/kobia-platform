/**
 * Round 58 — transaction-coupled server-rendered historical CRM reads.
 *
 * Historically the tenant-wide query helpers used getTenantDb() directly.
 * A tenant membership is NOT sufficient to return cross-business or cross-
 * client contents. This conservative compatibility boundary:
 * 1. rechecks live membership and ONE ever-created, ACTIVE business inside
 *    the exact tenant transaction;
 * 2. requires OWNER/ADMIN, never a staff/VIEWER-wide PII export;
 * 3. denies if ANY profile is missing service assignment, OR ANY service link
 *    lacks an unrevoked read grant for the current principal;
 * 4. runs the query's getTenantDb()/getTenantPrisma() through that exact
 *    SERIALIZABLE transaction; and
 * 5. inserts a minimal immutable security event before releasing data.
 *
 * This is intentionally fail-closed and may make legacy wide reports
 * unavailable until per-record service grants and businessId are backfilled.
 * It MUST NOT wrap a caller already in an audited transaction.
 */
import type { Prisma } from "@/lib/db/generated/tenant";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withHistoricalTenantReadScope } from "@/lib/db/historical-read-scope";
import { liveLegacyLeadActor, type LeadActor } from "./legacy-lead-security-round54";

const ID=/^[A-Za-z0-9._/-]{1,120}$/;
type Tx=Prisma.TransactionClient;

export async function assertHistoricalWideClientRead(
 tx:Tx,actor:LeadActor,
):Promise<void>{
 if(actor.role!=="OWNER"&&actor.role!=="ADMIN")
  throw new PermissionError("record:read");
 const unassigned=await tx.clientProfile.count({
  where:{serviceLinks:{none:{}}},
 });
 if(unassigned)throw new PermissionError("record:read");
 const allLinks=await tx.clientServiceLink.count();
 if(allLinks&&!actor.businessId)throw new PermissionError("record:read");
 if(actor.businessId){
  const withoutGrant=await tx.clientServiceLink.count({
   where:{OR:[
    {businessId:{not:actor.businessId}},
    {grants:{none:{
     clerkUserId:actor.id,revokedAt:null,canRead:true,
    }}},
   ]},
  });
  if(withoutGrant)throw new PermissionError("record:read");
 }
}

export function withAuditedHistoricalServerRead<A extends unknown[],R>(
 resourceId:string,original:(...args:A)=>Promise<R>,
):(...args:A)=>Promise<R>{
 if(!ID.test(resourceId)||resourceId.startsWith("/")||
    resourceId.includes("..")||resourceId.includes("//"))
  throw new Error("Unsafe server-read audit identifier");
 return async(...args:A):Promise<R>=>{
  const identity=await getCurrentMembership();
  if(!identity||identity.status!=="ACTIVE")
   throw new PermissionError("record:read");
  const {db,tenantId,schemaName}=getTenantDb();
  return db.$transaction(async tx=>{
   const actor=await liveLegacyLeadActor(tx,identity.clerkUserId,"record:read");
   await assertHistoricalWideClientRead(tx,actor);
   const value=await withHistoricalTenantReadScope({
    tenantId,schemaName,tx,
   },async scope=>{
    const result=await original(...args);
    if(scope.accesses===0)
     throw new Error("Sensitive query escaped tenant audit transaction");
    return result;
   });
   await tx.chessSecurityEvent.create({data:{
    businessId:actor.businessId,actorClerkUserId:actor.id,
    action:"HISTORICAL_SERVER_SENSITIVE_READ_ATOMIC",
    resourceType:"LegacyServerRead",resourceId,decision:"ALLOW",
   }});
   return value;
  },{isolationLevel:"Serializable",maxWait:5000,timeout:30000});
 };
}
