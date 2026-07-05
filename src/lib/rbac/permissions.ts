/*
 * permissions.ts - tenant-scoped RBAC matrix (Sprint 5).
 *
 * Roles (tenant Membership.role): OWNER, ADMIN, MEMBER, VIEWER.
 * Actions are coarse capability strings checked by requirePermission(). The
 * matrix below is the single source of truth. MEMBER has a narrower record
 * surface (CRUD on records they own + read others); ownership is enforced at
 * the action layer (passing ownerUserId), not encoded here.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export const ROLES: readonly Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

/**
 * Capability actions. Record CRUD is split read vs write because MEMBER can
 * read everything but only write records they own (the own-record check lives
 * in requirePermission's caller via the `ownerUserId` option).
 */
export type Action =
  | "record:read"
  | "record:create"
  | "record:update"
  | "record:delete"
  | "activity:create"
  | "report:run"
  | "report:manage"
  | "automation:manage"
  | "customfield:manage"
  | "tag:manage"
  | "form:manage"
  | "inventory:manage"
  | "email:manage"
  | "telephony:manage"
  | "member:manage"
  | "billing:manage"
  | "workspace:manage"
  | "tenant:delete";

/** Capabilities granted unconditionally to each role. */
const MATRIX: Record<Role, Set<Action>> = {
  OWNER: new Set<Action>([
    "record:read", "record:create", "record:update", "record:delete",
    "activity:create", "report:run", "report:manage",
    "automation:manage", "customfield:manage", "tag:manage", "form:manage", "inventory:manage",
    "email:manage", "telephony:manage",
    "member:manage", "billing:manage", "workspace:manage", "tenant:delete",
  ]),
  ADMIN: new Set<Action>([
    "record:read", "record:create", "record:update", "record:delete",
    "activity:create", "report:run", "report:manage",
    "automation:manage", "customfield:manage", "tag:manage", "form:manage", "inventory:manage",
    "email:manage", "telephony:manage",
    "member:manage", "workspace:manage",
  ]),
  MEMBER: new Set<Action>([
    "record:read", "record:create", "record:update",
    "activity:create", "report:run", "email:manage", "telephony:manage", "inventory:manage",
  ]),
  VIEWER: new Set<Action>([
    "record:read", "report:run",
  ]),
};

/**
 * True if the role has the capability outright. For MEMBER, record:update and
 * record:delete on records they do NOT own are denied; the caller passes
 * `ownsRecord` to grant the own-record exception (delete stays OWNER/ADMIN).
 */
export function can(
  role: Role,
  action: Action,
  opts?: { ownsRecord?: boolean },
): boolean {
  if (MATRIX[role].has(action)) return true;
  if (role === "MEMBER" && opts?.ownsRecord) {
    // MEMBER may update records they own. Delete remains admin-only.
    if (action === "record:update") return true;
  }
  return false;
}
