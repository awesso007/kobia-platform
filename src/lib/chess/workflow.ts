import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";

const input=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128).optional(),
 title:z.string().trim().min(2).max(250),
 assignedClerkUserId:z.string().min(1).max(128).optional(),
 dueAt:z.coerce.date().optional(),
}).strict();

export async function createChessWorkItem(data:unknown) {
 const parsed=input.parse(data);
 await assertBusinessAccess(parsed.businessId);
 const actor=await getCurrentMembership();
 if (!actor || !["OWNER","ADMIN","MEMBER"].includes(actor.role)) throw new PermissionError("record:create");
 const {db}=getTenantDb();
 if (parsed.assignedClerkUserId) {
  const assigned=await db.chessEmployeeAssignment.findUnique({
   where:{businessId_clerkUserId:{businessId:parsed.businessId,clerkUserId:parsed.assignedClerkUserId}},
   select:{revokedAt:true},
  });
  const member=await db.membership.findUnique({where:{clerkUserId:parsed.assignedClerkUserId},select:{status:true}});
  if (!assigned || assigned.revokedAt || member?.status!=="ACTIVE") throw new PermissionError("record:create");
 }
 if (parsed.clientProfileId) {
  const p=await db.clientProfile.findUnique({where:{id:parsed.clientProfileId},select:{id:true}});
  if (!p) throw new PermissionError("record:read");
 }
 return db.chessWorkItem.create({data:parsed,select:{
  id:true,businessId:true,title:true,status:true,assignedClerkUserId:true,dueAt:true,
 }});
}
export async function listChessWorkItems(businessId:string) {
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if (!actor) throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return db.chessWorkItem.findMany({
  where:{businessId,...(!["OWNER","ADMIN"].includes(actor.role)&&{assignedClerkUserId:actor.clerkUserId})},
  select:{id:true,title:true,status:true,dueAt:true,assignedClerkUserId:true},
  take:100,orderBy:{createdAt:"desc"},
 });
}
