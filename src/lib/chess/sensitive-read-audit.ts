import type {Prisma,PrismaClient} from "@/lib/db/generated/tenant";
import {PermissionError} from "@/lib/rbac/require-permission";

type SensitiveReadContext={
 businessId:string;actorClerkUserId:string;
 action:"REGULATED_WORKFLOW_READ"|"BANK_REVIEW_DETAILS_READ";
 resourceType:"ChessServiceCase";resourceId:string;
};
/** Privacy-minimal record-access outcome. No names, properties, amounts,
 * document keys or raw service payloads are persisted in the audit. */
export function sensitiveReadEvent(ctx:SensitiveReadContext,allowed:boolean){
 return {
  businessId:ctx.businessId,
  actorClerkUserId:ctx.actorClerkUserId,
  action:ctx.action,
  resourceType:ctx.resourceType,
  resourceId:ctx.resourceId,
  decision:allowed?"ALLOW" as const:"DENY" as const,
 };
}
export async function auditedChessSensitiveRead<T>(
 db:PrismaClient,ctx:SensitiveReadContext,
 read:(tx:Prisma.TransactionClient)=>Promise<T|null>,
):Promise<T>{
 // Commit the access decision and the SELECT in the same tenant-local
 // SERIALIZABLE transaction; if the ledger write fails, no data is returned.
 const value=await db.$transaction(async tx=>{
  const payload=await read(tx);
  await tx.chessSecurityEvent.create({
   data:sensitiveReadEvent(ctx,payload!==null),
  });
  return payload;
 },{isolationLevel:"Serializable"});
 if(value===null)throw new PermissionError("record:read");
 return value;
}
