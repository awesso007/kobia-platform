import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";

/** Owner/admin may manage any active unit. Other members must hold an active
 * MANAGER assignment in the requested unit; a general membership is insufficient. */
export async function assertBusinessManager(businessId:string){
 const actor=await getCurrentMembership();
 if(!actor || actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const business=await db.chessBusinessUnit.findUnique({
  where:{id:businessId},select:{status:true},
 });
 if(!business || business.status!=="ACTIVE")throw new PermissionError("record:read");
 if(actor.role==="OWNER"||actor.role==="ADMIN")return actor;
 if(actor.role!=="MEMBER")throw new PermissionError("record:read");
 const assignment=await db.chessEmployeeAssignment.findUnique({
  where:{businessId_clerkUserId:{businessId,clerkUserId:actor.clerkUserId}},
  select:{role:true,revokedAt:true},
 });
 if(!assignment||assignment.role!=="MANAGER"||assignment.revokedAt)
  throw new PermissionError("record:read");
 return actor;
}
