/**
 * Audited reads from pre-CHESS KOBIA tenant modules.
 *
 * Legacy CRM modules are schema-per-tenant. Sensitive records are returned
 * only after a fresh membership check, a single serializable read and the
 * corresponding durable, privacy-minimal event insert commit together.
 * An audit insert failure never releases selected data.
 */
import type {Prisma,PrismaClient,MembershipRole} from "@/lib/db/generated/tenant";
import {PermissionError} from "@/lib/rbac/require-permission";

export type HistoricalReadContext={
 actorClerkUserId:string;
 action:string;resourceType:string;resourceId:string;
 allowedRoles?:readonly MembershipRole[];
};
const DEFAULT_ROLES:readonly MembershipRole[]=["OWNER","ADMIN","MEMBER"];

export async function auditedHistoricalTenantRead<T>(
 db:PrismaClient,ctx:HistoricalReadContext,
 read:(tx:Prisma.TransactionClient)=>Promise<T|null>,
):Promise<T>{
 if(!ctx.actorClerkUserId)throw new PermissionError("record:read");
 const value=await db.$transaction(async tx=>{
  const member=await tx.membership.findUnique({
   where:{clerkUserId:ctx.actorClerkUserId},select:{status:true,role:true},
  });
  const allowed=member?.status==="ACTIVE"&&
   (ctx.allowedRoles??DEFAULT_ROLES).includes(member.role);
  const result=allowed?await read(tx):null;
  // No storage path, email body, taxpayer ID, contact name or payload is logged.
  await tx.chessSecurityEvent.create({data:{
   actorClerkUserId:ctx.actorClerkUserId,
   action:ctx.action,resourceType:ctx.resourceType,
   resourceId:ctx.resourceId,decision:result!==null?"ALLOW":"DENY",
  }});
  return result;
 },{isolationLevel:"Serializable"});
 if(value===null)throw new PermissionError("record:read");
 return value;
}
