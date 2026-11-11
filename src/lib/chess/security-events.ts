import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {z} from "zod";
const schema=z.object({
 businessId:z.string().min(1).max(128).optional(),
 action:z.string().trim().min(1).max(120),
 resourceType:z.string().trim().min(1).max(120),
 resourceId:z.string().min(1).max(128).optional(),
 decision:z.enum(["ALLOW","DENY","REVIEW","ERROR"]),
}).strict();

/** Server-managed audit event; no client-supplied actor identity or timestamps.
 * Production must add write-once DB privileges and out-of-band log delivery. */
export async function appendChessSecurityEvent(input:unknown) {
 const actor=await getCurrentMembership();
 if (!actor || actor.status!=="ACTIVE") throw new PermissionError("record:create");
 const data=schema.parse(input);
 const {db}=getTenantDb();
 return db.chessSecurityEvent.create({
  data:{...data,actorClerkUserId:actor.clerkUserId},
  select:{id:true,occurredAt:true},
 });
}
