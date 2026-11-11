import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";

const request=z.object({
 businessId:z.string().min(1).max(128),
 actionType:z.string().trim().min(3).max(100),
 payloadDigest:z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export function canReviewAction(requestedBy:string,reviewer:string,role:string):boolean {
 return requestedBy!==reviewer && ["OWNER","ADMIN"].includes(role);
}

export async function requestChessApproval(input:unknown) {
 const data=request.parse(input);
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if (!actor) throw new PermissionError("record:create");
 const {db}=getTenantDb();
 return db.chessActionApproval.create({data:{...data,requestedBy:actor.clerkUserId},
  select:{id:true,businessId:true,actionType:true,status:true}});
}

/** An approval is a recorded decision, never permission to run an automation
 * without separate execution authorization and idempotency controls. */
export async function reviewChessApproval(id:string,businessId:string,decision:"APPROVED"|"REJECTED") {
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if (!actor) throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const approval=await db.chessActionApproval.findFirst({
  where:{id,businessId},select:{requestedBy:true,status:true},
 });
 if (!approval || approval.status!=="PENDING" ||
     !canReviewAction(approval.requestedBy,actor.clerkUserId,actor.role)) {
  throw new PermissionError("record:update");
 }
 return db.chessActionApproval.updateMany({
  where:{id,businessId,status:"PENDING"},
  data:{status:decision,reviewedBy:actor.clerkUserId,reviewedAt:new Date()},
 });
}
