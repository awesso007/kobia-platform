/**
 * Unified Client Profile access policy.
 * A profile is tenant-local. Its service records are separate and require an
 * explicit active service grant, even when the actor can read the CRM contact.
 */
export const CLIENT_SERVICES = [
  "ACCOUNTING", "BOOKKEEPING", "PAYROLL", "TAX",
  "MORTGAGE", "INSURANCE", "REAL_ESTATE", "INVESTMENTS",
] as const;

export type ClientService = (typeof CLIENT_SERVICES)[number];
export type ProfileActor = {
  clerkUserId: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};
export type ServiceGrant = {
  clerkUserId: string;
  service: ClientService;
  canRead: boolean;
  canWrite: boolean;
  revokedAt?: Date | null;
};

export function canReadClientProfile(
  actor: ProfileActor | null,
  ownerClerkUserId: string | null,
): boolean {
  if (!actor || actor.status !== "ACTIVE") return false;
  return actor.role === "OWNER" || actor.role === "ADMIN" ||
    (actor.role === "MEMBER" && actor.clerkUserId === ownerClerkUserId);
}

export function canWriteClientProfile(
  actor: ProfileActor | null,
  ownerClerkUserId: string | null,
): boolean {
  return canReadClientProfile(actor, ownerClerkUserId) && actor?.role !== "VIEWER";
}

/** Deny by default. Administrative CRM access does not imply permission to see
 * mortgage, insurance, tax or other regulated service records. */
export function canAccessService(
  actor: ProfileActor | null,
  service: ClientService,
  grants: readonly ServiceGrant[],
  operation: "read" | "write",
): boolean {
  if (!actor || actor.status !== "ACTIVE" || actor.role === "VIEWER") return false;
  return grants.some(grant =>
    grant.clerkUserId === actor.clerkUserId &&
    grant.service === service &&
    !grant.revokedAt &&
    (operation === "read" ? grant.canRead : grant.canWrite)
  );
}

/** Deterministic stable profile fields only. Do not include service notes,
 * financial data, identity documents or other restricted records here. */
export type ClientProfileSummary = {
  id: string;
  displayName: string;
  ownerClerkUserId: string | null;
  contactId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
