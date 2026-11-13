import type {PrismaClient} from "@/lib/db/generated/tenant";

/** M2/M1: revoke business assignment and ALL existing explicit service
 * grants for this actor and business in the same SERIALIZABLE tenant
 * transaction. Reassigning later NEVER silently restores sensitive grants.
 * Does not touch grants in other legal/business units. */
export async function revokeBusinessAssignmentAndServiceGrants(
 db:PrismaClient,businessId:string,clerkUserId:string,revokedBy:string,
 now=new Date(),
):Promise<{count:number;revokedGrants:number}>{
 return db.$transaction(async tx=>{
  const assignment=await tx.chessEmployeeAssignment.findUnique({
   where:{businessId_clerkUserId:{businessId,clerkUserId}},
   select:{id:true,revokedAt:true},
  });
  if(!assignment||assignment.revokedAt)return {count:0,revokedGrants:0};
  const result=await tx.chessEmployeeAssignment.updateMany({where:{
   businessId,clerkUserId,revokedAt:null,
  },data:{revokedAt:now}});
  if(result.count!==1)return {count:0,revokedGrants:0};
  const grants=await tx.clientServiceGrant.updateMany({where:{
   clerkUserId,revokedAt:null,link:{is:{businessId}},
  },data:{revokedAt:now,canRead:false,canWrite:false}});
  await tx.chessSecurityEvent.create({data:{
   businessId,actorClerkUserId:revokedBy,
   action:"EMPLOYEE_ASSIGNMENT_AND_GRANTS_REVOKED",
   resourceType:"ChessEmployeeAssignment",resourceId:assignment.id,
   decision:"ALLOW",
  }});
  return {count:1,revokedGrants:grants.count};
 },{isolationLevel:"Serializable"});
}
