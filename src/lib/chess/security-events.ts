/**
 * Round 57: a request-authored security note must never fabricate an
 * authoritative ALLOW, DENY or automated provider audit outcome.
 * Client input may request only an operator REVIEW note, using fixed action
 * and resource type. The live admin role and optional business scope are
 * revalidated within the same SERIALIZABLE tenant audit transaction.
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { z } from "zod";

const schema=z.object({
 businessId:z.string().min(1).max(128).optional(),
 action:z.literal("OPERATOR_SECURITY_REVIEW_REQUESTED"),
 resourceType:z.literal("SecurityReview"),
 resourceId:z.string().min(1).max(128).optional(),
 decision:z.literal("REVIEW"),
}).strict();
export async function appendChessSecurityEvent(input:unknown){
 const identity=await getCurrentMembership();
 if(!identity||identity.status!=="ACTIVE"||
    !["OWNER","ADMIN"].includes(identity.role))
  throw new PermissionError("member:manage");
 const data=schema.parse(input);
 const {db}=getTenantDb();
 return db.$transaction(async tx=>{
  const member=await tx.membership.findUnique({
   where:{clerkUserId:identity.clerkUserId},select:{status:true,role:true},
  });
  if(member?.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(member.role))
   throw new PermissionError("member:manage");
  if(data.businessId){
   const unit=await tx.chessBusinessUnit.findUnique({
    where:{id:data.businessId},select:{status:true},
   });
   if(unit?.status!=="ACTIVE")throw new PermissionError("member:manage");
  }
  return tx.chessSecurityEvent.create({
   data:{...data,actorClerkUserId:identity.clerkUserId},
   select:{id:true,occurredAt:true},
  });
 },{isolationLevel:"Serializable",maxWait:5000,timeout:10000});
}
