/**
 * Historical KOBIA authenticated GET response audit.
 *
 * Unlike a SELECT inside auditedHistoricalTenantRead, this is a RELEASE
 * boundary for legacy handlers whose query logic still owns its Prisma
 * client. It checks the current Clerk membership before invoking the route
 * and commits an additional live-membership check + immutable tenant audit
 * AFTER response construction, BEFORE bytes leave the route. A failed audit
 * returns a generic 503 with no private body. This is not the same as
 * transaction-coupled SELECT and must not be represented as such.
 *
 * Never use this wrapper for public tokens, external callbacks, streaming
 * request mutations, or unauthenticated GET endpoints. Those have distinct
 * capability/verification requirements.
 */
import {NextResponse} from "next/server";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {auditedHistoricalTenantRead} from "./historical-sensitive-read";

const ALLOWED_PATH=/^[a-z0-9/\[\]._-]{1,190}$/;
const INTERNAL_ROLES=["OWNER","ADMIN","MEMBER","VIEWER"] as const;

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
 if(!ALLOWED_PATH.test(routeId)||routeId.startsWith("/")||
    routeId.includes("..")||routeId.includes("//"))
  throw new Error("Unsafe historical route audit identifier");
 return async (...args:A):Promise<Response>=>{
  // Never execute a legacy read to construct a body for a nonmember.
  const actor=await getCurrentMembership();
  if(actor?.status!=="ACTIVE")
   return NextResponse.json({error:"Forbidden"},{status:403,
    headers:{"Cache-Control":"no-store"}});
  let response:R;
  try{
   response=await original(...args);
  }catch{
   // No successful data-bearing response was prepared. Do not reveal error
   // internals; the existing legacy handler may still need separate review.
   return NextResponse.json({error:"Read unavailable"},{status:503,
    headers:{"Cache-Control":"no-store"}});
  }
  try{
   const {db}=getTenantDb();
   // An explicitly denied legacy response is audited as DENY, but still
   // returns its non-success status only when the audit insert commits.
   const denied=response.status>=400;
   await auditedHistoricalTenantRead(db,{
    actorClerkUserId:actor.clerkUserId,
    action:"HISTORICAL_AUTHENTICATED_GET_RESPONSE",
    resourceType:"HistoricalApiRoute",resourceId:routeId,
    allowedRoles:INTERNAL_ROLES,
   },async()=>denied?null:true);
  }catch(err){
   if(err instanceof PermissionError&&response.status>=400){
    response.headers.set("Cache-Control","no-store");
    return response;
   }
   return NextResponse.json({error:"Read verification unavailable"},{
    status:503,headers:{"Cache-Control":"no-store"}});
  }
  response.headers.set("Cache-Control","no-store");
  return response;
 };
}
