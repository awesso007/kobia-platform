import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";
import {auditedChessEmployeeRead} from "./sensitive-read-audit";

const request=z.object({
 businessId:z.string().min(1).max(128),
 actionType:z.string().trim().min(3).max(100),
 payloadDigest:z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

/** Financial/regulated decisions must never originate from arbitrary
 * user-supplied digests at the generic review endpoint. */
export function protectedChessApprovalType(actionType:string):boolean {
 return /^(?:PAYROLL_|BANK_|TAX_|REGULATED_|MORTGAGE_|INSURANCE_|INVESTMENT_|REAL_ESTATE_|FINANCIAL_|MERCHANT_|BILLING_)/.test(actionType);
}

export function canReviewAction(requestedBy:string,reviewer:string,role:string):boolean {
 return requestedBy!==reviewer && ["OWNER","ADMIN"].includes(role);
}

export async function requestChessApproval(input:unknown) {
 const data=request.parse(input);
 if(protectedChessApprovalType(data.actionType))throw new PermissionError("record:create");
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if (!actor || actor.status!=="ACTIVE") throw new PermissionError("record:create");
 const {db}=getTenantDb();
 return db.$transaction(async tx=>{
  const row=await tx.chessActionApproval.create({
   data:{...data,requestedBy:actor.clerkUserId},
   select:{id:true,businessId:true,actionType:true,status:true},
  });
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"ACTION_APPROVAL_REQUESTED",resourceType:"ChessActionApproval",
   resourceId:row.id,decision:"REVIEW",
  }});
  return row;
 });
}

/** An approval is a recorded decision, never permission to run an automation
 * without separate execution authorization and idempotency controls. */
export async function reviewChessApproval(id:string,businessId:string,decision:"APPROVED"|"REJECTED") {
 await assertBusinessAccess(businessId);
 const actor=await getCurrentMembership();
 if (!actor || actor.status!=="ACTIVE") throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const approval=await db.chessActionApproval.findFirst({
  where:{id,businessId},select:{requestedBy:true,status:true,actionType:true},
 });
 if (!approval || protectedChessApprovalType(approval.actionType) ||
     approval.status!=="PENDING" ||
     !canReviewAction(approval.requestedBy,actor.clerkUserId,actor.role)) {
  throw new PermissionError("record:update");
 }
 return db.$transaction(async tx=>{
  const changed=await tx.chessActionApproval.updateMany({
   where:{id,businessId,status:"PENDING"},
   data:{status:decision,reviewedBy:actor.clerkUserId,reviewedAt:new Date()},
  });
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId,actorClerkUserId:actor.clerkUserId,
   action:"ACTION_APPROVAL_DECIDED",resourceType:"ChessActionApproval",
   resourceId:id,decision:decision==="APPROVED"?"ALLOW":"DENY",
  }});
  return changed;
 });
}


/** Review queue exposes operational action type and actors only. The
 * digest is never returned to an employee screen. Staff see their own
 * requests; independent tenant admins can view the whole unit queue. */
export async function listChessActionApprovals(businessId:string){
 const id=z.string().min(1).max(128).parse(businessId);
 await assertBusinessAccess(id);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return auditedChessEmployeeRead(db,{
  businessId:id,actorClerkUserId:actor.clerkUserId,
  action:"ACTION_APPROVAL_DIRECTORY_READ",resourceType:"ChessActionApproval",
  resourceId:"business:"+id,
 },async tx=>{
  const current=await tx.membership.findUnique({
   where:{clerkUserId:actor.clerkUserId},
   select:{status:true,role:true},
  });
  if(!current||current.status!=="ACTIVE")return null;
  const reviewer=["OWNER","ADMIN"].includes(current.role);
  const rows=await tx.chessActionApproval.findMany({
   where:{businessId:id,...(!reviewer?{requestedBy:actor.clerkUserId}:{})},
   select:{id:true,actionType:true,requestedBy:true,reviewedBy:true,
    status:true,createdAt:true,reviewedAt:true},
   orderBy:{createdAt:"desc"},take:100,
  });
  // Never send creator/reviewer Clerk IDs to the browser merely to decide
  // whether a button should appear. Re-evaluate the role in the same snapshot.
  return rows.map(({requestedBy,reviewedBy:_reviewedBy,...row})=>({
   ...row,canReview:row.status==="PENDING"&&
    !protectedChessApprovalType(row.actionType)&&
    canReviewAction(requestedBy,actor.clerkUserId,current.role),
  }));
 });
}
