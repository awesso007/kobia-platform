import {z} from "zod";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {resolveChessPostedPayrollRun} from "./payroll-source";

/** Request a REVIEW only. No payroll transmission, wage/employee details or
 * client-supplied amounts/digests are processed here. Explicitly disabled
 * without separately approved internal workflow policy. */
const inputSchema=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 legacyPayRunId:z.string().min(1).max(128),
}).strict();

export function payrollApprovalRequestEnabled(flags:{
 CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED?:string;CHESS_DEMO_MODE?:string;
}):boolean{
 return flags.CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED==="true"&&
  flags.CHESS_DEMO_MODE!=="true";
}
export function payrollApprovalRequesterAllowed(
 role:string,status:string,assignmentRole:string|null,revoked:boolean,
):boolean{
 if(status!=="ACTIVE")return false;
 if(role==="OWNER"||role==="ADMIN")return true;
 return role==="MEMBER"&&!revoked&&
  (assignmentRole==="MANAGER"||assignmentRole==="PRACTITIONER");
}

export async function requestChessPayrollApproval(input:unknown){
 const data=inputSchema.parse(input);
 if(!payrollApprovalRequestEnabled({
  CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED:process.env.CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED,
  CHESS_DEMO_MODE:process.env.CHESS_DEMO_MODE,
 }))throw new PermissionError("record:create");
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:create");
 const {db,run,digest}=await resolveChessPostedPayrollRun(data);
 // No second authorization request after any provider attempt; UNKNOWN
 // is never a reason to transmit or approve the same run again.
 const dispatched=await db.chessPayrollDispatch.findFirst({where:{
  businessId:data.businessId,legacyPayRunId:run.id,
 },select:{id:true}});
 if(dispatched)throw new PermissionError("record:create");
 return db.$transaction(async tx=>{
  const [membership,unit,assignment,existing]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:actor.clerkUserId},
    select:{role:true,status:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:data.businessId},
    select:{status:true}}),
   tx.chessEmployeeAssignment.findUnique({where:{
    businessId_clerkUserId:{businessId:data.businessId,
     clerkUserId:actor.clerkUserId},
   },select:{role:true,revokedAt:true}}),
   tx.chessActionApproval.findFirst({where:{
    businessId:data.businessId,actionType:"PAYROLL_EXECUTE",
    payloadDigest:digest,
   },select:{id:true,status:true,requestedBy:true}}),
  ]);
  if(unit?.status!=="ACTIVE"||!membership||
   !payrollApprovalRequesterAllowed(membership.role,membership.status,
    assignment?.role??null,!!assignment?.revokedAt))
   throw new PermissionError("record:create");
  if(existing){
   if(existing.requestedBy!==actor.clerkUserId)
    throw new PermissionError("record:create");
   return {id:existing.id,status:existing.status};
  }
  const approval=await tx.chessActionApproval.create({data:{
   businessId:data.businessId,actionType:"PAYROLL_EXECUTE",
   payloadDigest:digest,requestedBy:actor.clerkUserId,
  },select:{id:true,status:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"PAYROLL_SOURCE_APPROVAL_REQUESTED",
   resourceType:"ChessActionApproval",resourceId:approval.id,
   decision:"REVIEW",
  }});
  return approval;
 },{isolationLevel:"Serializable"});
}
