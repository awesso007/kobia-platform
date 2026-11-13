/**
 * Round 56: the historical CRM tables do not carry businessId. Scope them to
 * one historically existing ACTIVE business, recheck LIVE tenant membership,
 * grant/ownership and mandatory privacy-minimal audit within the same
 * SERIALIZABLE transaction. Linked CHESS ClientProfile records additionally
 * require a currently unrevoked, service-specific ClientServiceGrant:
 * tenant/employee membership alone is NEVER access to a client's service.
 *
 * Cross-company joins must not infer consent from a different contact. When a
 * company contains an inaccessible client, the company and its deals are
 * withheld rather than returning another client's contact or aggregate data.
 */
import type { Prisma, PrismaClient } from "@/lib/db/generated/tenant";
import { PermissionError } from "@/lib/rbac/require-permission";
import { can, type Action } from "@/lib/rbac/permissions";
import {
  liveLegacyLeadActor, type LeadActor,
} from "./legacy-lead-security-round54";

export type LegacyCrmEntity = "CONTACT" | "COMPANY" | "DEAL" | "LEAD";
export type LegacyTx = Prisma.TransactionClient;

export async function legacyContactClientAccess(
  tx: LegacyTx, actor: LeadActor, contactId: string, write: boolean,
): Promise<void> {
  const profile = await tx.clientProfile.findUnique({
    where: { contactId }, select: { id: true },
  });
  if (!profile) return; // Ordinary CRM contact without CHESS client service.
  if (!actor.businessId) throw new PermissionError(write ? "record:update" : "record:read");
  const link = await tx.clientServiceLink.findFirst({
    where: {
      profileId: profile.id, businessId: actor.businessId,
      grants: { some: { clerkUserId: actor.id, revokedAt: null,
        canRead: true, ...(write ? { canWrite: true } : {}) } },
    },
    select: { id: true },
  });
  if (!link) throw new PermissionError(write ? "record:update" : "record:read");
}

export async function legacyCompanyClientAccess(
  tx: LegacyTx, actor: LeadActor, companyId: string, write: boolean,
): Promise<void> {
  const all = await tx.contact.count({ where: { companyId } });
  // No unbounded relation traversal: the company is inaccessible until
  // migrated to explicit per-client and per-business ownership.
  if (all > 200) throw new PermissionError("record:read");
  const contacts = await tx.contact.findMany({
    where: { companyId }, select: { id: true }, take: 201,
  });
  for (const row of contacts) await legacyContactClientAccess(tx, actor, row.id, write);
}

export async function assertLegacyCrmRecord(
  tx: LegacyTx, actor: LeadActor, entity: LegacyCrmEntity, id: string,
  action: "record:read" | "record:update" | "record:delete",
): Promise<void> {
  if (!id || id.length > 128) throw new PermissionError(action);
  let ownerId: string | null = null;
  let contactId: string | null = null;
  let companyId: string | null = null;
  switch (entity) {
    case "CONTACT": {
      const row = await tx.contact.findUnique({
        where: { id }, select: { ownerUserId: true, companyId: true },
      });
      if (!row) throw new PermissionError(action);
      ownerId = row.ownerUserId; contactId = id; companyId = row.companyId;
      break;
    }
    case "COMPANY": {
      const row = await tx.company.findUnique({
        where: { id }, select: { ownerUserId: true },
      });
      if (!row) throw new PermissionError(action);
      ownerId = row.ownerUserId; companyId = id;
      break;
    }
    case "DEAL": {
      const row = await tx.deal.findUnique({
        where: { id }, select: { ownerUserId: true, contactId: true, companyId: true },
      });
      if (!row) throw new PermissionError(action);
      ownerId = row.ownerUserId; contactId = row.contactId; companyId = row.companyId;
      break;
    }
    case "LEAD": {
      const row = await tx.lead.findUnique({
        where: { id }, select: { ownerUserId: true },
      });
      if (!row) throw new PermissionError(action);
      ownerId = row.ownerUserId;
      break;
    }
  }
  // MEMBER may read/modify only owned records. Never delete, regardless of
  // ownership. VIEWER is already excluded by liveLegacyLeadActor.
  if (actor.role === "MEMBER" && ownerId !== actor.id)
    throw new PermissionError(action);
  if (!can(actor.role, action, { ownsRecord: ownerId === actor.id }))
    throw new PermissionError(action);
  const write = action !== "record:read";
  if (contactId) await legacyContactClientAccess(tx, actor, contactId, write);
  if (companyId) await legacyCompanyClientAccess(tx, actor, companyId, write);
}

export async function withLegacyCrmTransaction<T>(
  db: PrismaClient, userId: string, action: Action,
  entity: LegacyCrmEntity, resourceId: string, eventName: string,
  cb: (tx: LegacyTx, actor: LeadActor) => Promise<T>,
): Promise<T> {
  return db.$transaction(async tx => {
    // Record updates by MEMBER are permitted on owned records only; check
    // owner inside assertLegacyCrmRecord. Never preapprove broad updates.
    const actor = await liveLegacyLeadActor(tx, userId,
      action === "record:update" || action === "record:delete" ? "record:read" : action);
    const result = await cb(tx, actor);
    await tx.chessSecurityEvent.create({ data: {
      businessId: actor.businessId, actorClerkUserId: actor.id,
      action: eventName, resourceType: "Legacy" + entity,
      resourceId, decision: "ALLOW",
    } });
    return result;
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });
}

export async function verifyLegacyCrmCreateOwner(
  tx: LegacyTx, actor: LeadActor, requested: string | null,
): Promise<string | null> {
  if (!can(actor.role, "record:create")) throw new PermissionError("record:create");
  if (actor.role === "MEMBER" && requested && requested !== actor.id)
    throw new PermissionError("record:create");
  const id = actor.role === "MEMBER" ? actor.id : requested;
  if (!id) return null;
  const member = await tx.membership.findUnique({
    where: { clerkUserId: id }, select: { status: true, role: true },
  });
  if (member?.status !== "ACTIVE" || member.role === "VIEWER")
    throw new PermissionError("record:create");
  if (actor.businessId) {
    const assigned = await tx.chessEmployeeAssignment.findUnique({
      where: { businessId_clerkUserId: { businessId: actor.businessId, clerkUserId: id } },
      select: { revokedAt: true },
    });
    if (!assigned || assigned.revokedAt) throw new PermissionError("record:create");
  }
  return id;
}
