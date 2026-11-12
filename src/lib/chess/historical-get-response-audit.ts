/**
 * Historical authenticated GET/readonly-search atomic SELECT release boundary.
 *
 * Round 50: A SERIALIZABLE per-tenant Prisma transaction now performs
 * membership validation, the original handler's SELECTs and immutable audit
 * insertion. During the callback all getTenantDb/getTenantPrisma resolves
 * for this tenant are redirected to the transaction through isolated
 * AsyncLocalStorage. A response is released only AFTER commit succeeds.
 *
 * This mechanism does NOT make unrelated platform Prisma/tRPC clients or
 * helper-internal explicit transactions magically atomic; those require
 * separate handling. Do not apply to writes, public tokens or callbacks.
 */
import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import { withHistoricalTenantReadScope } from "@/lib/db/historical-read-scope";

const ALLOWED_PATH = /^[A-Za-z0-9/\[\]._-]{1,190}$/;
const ALREADY_AUDITED = new Set([
  // Each profile/service data SELECT already has its own serializable
  // tenant transaction, live ownership/grant checks and security event.
  "client-profiles",
  "client-profiles/[profileId]/services",
]);
const ALLOWED_ROLES = new Set(["OWNER","ADMIN","MEMBER","VIEWER"]);

function deny(status:403|503):NextResponse{
 return NextResponse.json({error:status===403?"Forbidden":"Read unavailable"},{
  status,headers:{"Cache-Control":"no-store"},
 });
}
function validateRouteId(routeId:string):void{
 if(!ALLOWED_PATH.test(routeId)||routeId.startsWith("/")||
    routeId.includes("..")||routeId.includes("//"))
  throw new Error("Unsafe historical route audit identifier");
}

export function historicalResponseRelease(input:{
 authenticated:boolean;audited:boolean;httpStatus:number;
}):"RELEASE"|"DENY"|"UNAVAILABLE"{
 if(!input.authenticated)return "DENY";
 if(!input.audited)return "UNAVAILABLE";
 return "RELEASE";
}

export function withAuditedHistoricalGet<A extends unknown[],R extends Response>(
 routeId:string,original:(...args:A)=>Promise<R>,
):(...args:A)=>Promise<Response>{
 validateRouteId(routeId);
 if(ALREADY_AUDITED.has(routeId))
  throw new Error("Already-audited source must use withAlreadyAuditedHistoricalGet");
 return async (...args:A):Promise<Response>=>{
  const actor=await getCurrentMembership();
  if(actor?.status!=="ACTIVE")return deny(403);
  try{
   const {db,tenantId,schemaName}=getTenantDb();
   const outcome=await db.$transaction(async tx=>{
    const membership=await tx.membership.findUnique({
     where:{clerkUserId:actor.clerkUserId},select:{status:true,role:true},
    });
    const allowed=membership?.status==="ACTIVE"&&
      ALLOWED_ROLES.has(membership.role);
    if(!allowed){
     await tx.chessSecurityEvent.create({data:{
      actorClerkUserId:actor.clerkUserId,
      action:"HISTORICAL_AUTHENTICATED_GET_ATOMIC",
      resourceType:"HistoricalApiRoute",resourceId:routeId,
      decision:"DENY",
     }});
     return null;
    }
    const response=await withHistoricalTenantReadScope({
     tenantId,schemaName,tx,
    },async scope=>{
     const result=await original(...args);
     // Successful response from an unbound database / static helper is not
     // certified by this transaction. Fail CLOSED without returning bytes.
     if(result.status<400&&scope.accesses===0)
      throw new Error("Historical GET bypassed transaction-bound tenant access");
     return result;
    });
    await tx.chessSecurityEvent.create({data:{
     actorClerkUserId:actor.clerkUserId,
     action:"HISTORICAL_AUTHENTICATED_GET_ATOMIC",
     resourceType:"HistoricalApiRoute",resourceId:routeId,
     decision:response.status<400?"ALLOW":"DENY",
    }});
    return response;
   },{isolationLevel:"Serializable",maxWait:5000,timeout:30000});
   if(!outcome)return deny(403);
   if(outcome.status>=500)return deny(503);
   outcome.headers.set("Cache-Control","no-store");
   return outcome;
  }catch{
   // If SELECT, authorization, event insert, or COMMIT fails, no sensitive
   // body is released. Do not leak legacy internal error details.
   return deny(503);
  }
 };
}

/**
 * Only for the two profile endpoints whose precise source data is ALREADY
 * selected by auditedChessSensitiveRead/auditedClientServiceRead in a live
 * serializable tenant transaction. Must never allow general legacy modules.
 * Maintains preflight and no-store; underlying services own atomic auditing.
 */
export function withAlreadyAuditedHistoricalGet<A extends unknown[],R extends Response>(
 routeId:string,original:(...args:A)=>Promise<R>,
):(...args:A)=>Promise<Response>{
 validateRouteId(routeId);
 if(!ALREADY_AUDITED.has(routeId))throw new Error("Route lacks prior atomic source audit");
 return async (...args:A):Promise<Response>=>{
  const actor=await getCurrentMembership();
  if(actor?.status!=="ACTIVE")return deny(403);
  try{
   const response=await original(...args);
   if(response.status>=500)return deny(503);
   response.headers.set("Cache-Control","no-store");
   return response;
  }catch{return deny(503);}
 };
}

/** Search is read-only POST. Never use this for a mutation/callback. */
export const withAuditedHistoricalReadResponse=withAuditedHistoricalGet;
