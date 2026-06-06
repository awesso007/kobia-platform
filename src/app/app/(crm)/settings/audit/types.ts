/*
 * Client-safe audit types and constants. Kept separate from queries.ts so the
 * client AuditLog component can import them without pulling in the server-only
 * getTenantDb() (which imports next/headers).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "VIEW"] as const;
export type AuditActionKind = (typeof AUDIT_ACTIONS)[number];

export type AuditRow = {
  id: string;
  action: AuditActionKind;
  entityType: string;
  entityId: string;
  actorClerkUserId: string | null;
  actorEmail: string | null;
  diff: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};
