/**
 * Round 54: legacy lead CRM rows have no businessId. Never pretend that tenant
 * membership equals access across several CHESS business units. Until a
 * backfill assigns each record to a business/client grant, fail CLOSED in
 * multi-business tenants. All successful reads/writes recheck live membership,
 * business assignment and minimal immutable access event inside SERIALIZABLE
 * transaction, so a revoked role cannot release a mutation response.
 */
import type { Prisma, PrismaClient } from "@/lib/db/generated/tenant";
import { PermissionError } from "@/lib/rbac/require-permission";
import { can, type Action, type Role } from "@/lib/rbac/permissions";

type Tx = Prisma.TransactionClient;
export type LeadActor = { id: string; role: Role; businessId: string | null };
export async function liveLegacyLeadActor(
  tx: Tx, clerkUserId: string, action: Action, ownerId?: string | null,
): Promise<LeadActor> {
  const member = await tx.membership.findUnique({
    where: { clerkUserId }, select: { status: true, role: true },
  });
  if (!member || member.status !== "ACTIVE" ||
      !can(member.role as Role, action, { ownsRecord: !!ownerId && ownerId === clerkUserId }))
    throw new PermissionError(action);
  const units = await tx.chessBusinessUnit.findMany({
    select: { id: true, status: true }, take: 2,
  });
  // Even an INACTIVE/closed unit still owns historical records. Never expose
  // legacy unpartitioned data if a tenant has had multiple business units.
  if (units.length > 1 || (units[0] && units[0].status !== "ACTIVE"))
    throw new PermissionError(action);
  const businessId = units[0]?.id ?? null;
  if (businessId && member.role === "MEMBER") {
    const assignment = await tx.chessEmployeeAssignment.findUnique({
      where: { businessId_clerkUserId: { businessId, clerkUserId } },
      select: { revokedAt: true },
    });
    if (!assignment || assignment.revokedAt) throw new PermissionError(action);
  }
  // Legacy unpartitioned lead PII is not available to tenant VIEWER.
  if (member.role === "VIEWER") throw new PermissionError(action);
  return { id: clerkUserId, role: member.role as Role, businessId };
}
export async function withAuditedLegacyLeadMutation<T>(
  db: PrismaClient, userId: string, action: Action, eventName: string,
  resourceId: string, callback: (tx: Tx, actor: LeadActor) => Promise<T>,
  ownerId?: string | null,
): Promise<T> {
  return db.$transaction(async tx => {
    const actor = await liveLegacyLeadActor(tx, userId, action, ownerId);
    const value = await callback(tx, actor);
    await tx.chessSecurityEvent.create({
      data: { businessId: actor.businessId, actorClerkUserId: actor.id,
        action: eventName, resourceType: "LegacyLead", resourceId,
        decision: "ALLOW" },
    });
    return value;
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });
}
export async function withAuditedLegacyLeadRead<T>(
  db: PrismaClient, userId: string, eventName: string, resourceId: string,
  callback: (tx: Tx, actor: LeadActor) => Promise<T>,
): Promise<T> {
  return db.$transaction(async tx => {
    const actor = await liveLegacyLeadActor(tx, userId, "record:read");
    const value = await callback(tx, actor);
    await tx.chessSecurityEvent.create({
      data: { businessId: actor.businessId, actorClerkUserId: actor.id,
        action: eventName, resourceType: "LegacyLead", resourceId,
        decision: "ALLOW" },
    });
    return value;
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });
}
export function legacyOwnerFilter(actor: LeadActor): { ownerUserId?: string } {
  // MEMBER reads/writes only records they currently own.
  return actor.role === "MEMBER" ? { ownerUserId: actor.id } : {};
}
