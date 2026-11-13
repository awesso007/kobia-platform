/**
 * Round 57 — authenticated historical API mutation release boundary.
 *
 * For eligible tenant-local REST handlers with NO external effects and NO
 * internal transaction, the ORIGINAL handler runs inside the SAME SERIALIZABLE
 * tenant transaction as live membership/role validation and the required audit
 * event. A non-success response, error, bypassed transaction or event failure
 * ROLLS BACK the handler writes, not merely hides the response.
 *
 * This wrapper does not confer business/client grants. Parent-specific
 * authorization remains mandatory in the original handler or service.
 * Other sources such as raw legacy DB and external providers are NOT covered.
 */
import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import { withHistoricalTenantWriteScope } from "@/lib/db/historical-read-scope";

const ROUTE=/^[A-Za-z0-9/[\]._-]{1,190}$/;
const METHODS=new Set(["POST","PUT","PATCH","DELETE"]);
const ROLE=new Set(["OWNER","ADMIN","MEMBER","VIEWER"]);
class RollbackStatus extends Error{
 constructor(readonly status:number){super("Audit transaction not committed");}
}
function denied(status:number):Response{
 return NextResponse.json({ok:false,error:status===403?"Forbidden":status===404?
  "Not found":status===400?"Invalid request":"Mutation unavailable"},{
    status:status===403||status===404||status===400?status:503,
    headers:{"Cache-Control":"no-store"},
  });
}
export function withAuditedHistoricalMutation<A extends unknown[],R extends Response>(
 routeId:string,method:"POST"|"PUT"|"PATCH"|"DELETE",
 original:(...args:A)=>Promise<R>,
):(...args:A)=>Promise<Response>{
 if(!ROUTE.test(routeId)||routeId.startsWith("/")||
    routeId.includes("..")||routeId.includes("//")||
    !METHODS.has(method))
  throw new Error("Unsafe historical mutation audit ID");
 return async(...args:A):Promise<Response>=>{
  const principal=await getCurrentMembership();
  if(principal?.status!=="ACTIVE")return denied(403);
  try{
   const {db,tenantId,schemaName}=getTenantDb();
   const outcome=await db.$transaction(async tx=>{
    const member=await tx.membership.findUnique({
      where:{clerkUserId:principal.clerkUserId},
      select:{status:true,role:true},
    });
    if(member?.status!=="ACTIVE"||!ROLE.has(member.role))
      throw new RollbackStatus(403);
    const {result,accesses}=await withHistoricalTenantWriteScope({
      tenantId,schemaName,tx,
    },async scope=>{
      const result=await original(...args);
      return {result,accesses:scope.accesses};
    });
    if(result.status>=400){
      const status=[400,403,404].includes(result.status)?result.status:503;
      throw new RollbackStatus(status);
    }
    if(accesses===0)
      throw new Error("Handler escaped tenant write transaction");
    await tx.chessSecurityEvent.create({data:{
      actorClerkUserId:principal.clerkUserId,
      action:"HISTORICAL_AUTHENTICATED_MUTATION_ATOMIC",
      resourceType:"HistoricalApiMutation",
      resourceId:method+" "+routeId,decision:"ALLOW",
    }});
    return result;
   },{isolationLevel:"Serializable",maxWait:5000,timeout:30000});
   outcome.headers.set("Cache-Control","no-store");
   return outcome;
  }catch(error){
    return denied(error instanceof RollbackStatus?error.status:503);
  }
 };
}
