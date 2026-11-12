import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {listBusinessUnits} from "./business-units";

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

/** Navigation-only list of business units in which the signed-in user is
 * CURRENTLY authorized to act as manager. This never grants permission; each
 * service API must still assert its own manager and client-record access. */
export async function listChessManagedBusinessUnits(){
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const units=await listBusinessUnits();
 if(actor.role==="OWNER"||actor.role==="ADMIN")return units;
 if(actor.role!=="MEMBER"||units.length===0)return [];
 const {db}=getTenantDb();
 const managed=await db.chessEmployeeAssignment.findMany({where:{
  clerkUserId:actor.clerkUserId,role:"MANAGER",revokedAt:null,
  businessId:{in:units.map(unit=>unit.id)},
 },select:{businessId:true}});
 const allowed=new Set(managed.map(item=>item.businessId));
 return units.filter(unit=>allowed.has(unit.id));
}
