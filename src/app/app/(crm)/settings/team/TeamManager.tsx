"use client";

/*
 * Team manager (RBAC). Lists tenant members, supports inline role edit,
 * suspend/reactivate, remove (Owner only), and an invite modal. Role-edit
 * affordances are gated client-side by the viewer's own role; the server
 * actions enforce the real rules.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/rbac/permissions";
import { inviteMember, changeMemberRole, setMemberStatus, removeMember } from "./actions";

export type MemberRow = {
  id: string;
  clerkUserId: string;
  role: string;
  email: string | null;
  displayName: string | null;
  status: string;
  joinedAt: string;
};

const ASSIGNABLE: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
const INVITE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"];

function initials(m: MemberRow): string {
  const base = m.displayName || m.email || "?";
  return base.slice(0, 2).toUpperCase();
}

export function TeamManager({
  members,
  myRole,
  myClerkUserId,
}: {
  members: MemberRow[];
  myRole: Role;
  myClerkUserId: string | null;
}) {
  const [pending, start] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  function run(fn: () => Promise<unknown>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  function rolesFor(target: MemberRow): Role[] {
    if (myRole === "OWNER") return ASSIGNABLE;
    if (myRole === "ADMIN") {
      if (target.role === "OWNER" || target.role === "ADMIN") return [target.role as Role];
      return ["ADMIN", "MEMBER", "VIEWER"];
    }
    return [target.role as Role];
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600 }}>Team members</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 rounded text-sm text-white"
            style={{ backgroundColor: "var(--kb-primary)", padding: "var(--kb-btn-pad-y) var(--kb-btn-pad-x)", borderRadius: "var(--kb-radius-sm)" }}
          >
            <UserPlus size={15} /> Invite member
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded p-2 text-sm" style={{ backgroundColor: "#fdecea", color: "var(--kb-error)" }}>{error}</div>
      )}

      <div className="overflow-hidden rounded" style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <Th>Member</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isMe = myClerkUserId != null && m.clerkUserId === myClerkUserId;
              const roleChoices = rolesFor(m);
              const roleEditable = canManage && roleChoices.length > 1 && !(isMe && m.role === "OWNER");
              return (
                <tr key={m.id} style={{ borderTop: "1px solid var(--kb-border)" }}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: "var(--kb-accent-purple)" }}>
                        {initials(m)}
                      </span>
                      <span>{m.displayName || "(no name)"}{isMe ? " (you)" : ""}</span>
                    </div>
                  </Td>
                  <Td>{m.email || "-"}</Td>
                  <Td>
                    {roleEditable ? (
                      <select
                        defaultValue={m.role}
                        disabled={pending}
                        onChange={(e) => run(() => changeMemberRole(m.id, e.target.value))}
                        className="rounded px-2 py-1 text-sm"
                        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
                      >
                        {roleChoices.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    ) : (
                      <span>{ROLE_LABEL[m.role as Role] ?? m.role}</span>
                    )}
                  </Td>
                  <Td><StatusPill status={m.status} /></Td>
                  <Td>{new Date(m.joinedAt).toLocaleDateString()}</Td>
                  <Td>
                    {canManage && !isMe && (
                      <div className="flex gap-2">
                        {m.status === "SUSPENDED" ? (
                          <Action onClick={() => run(() => setMemberStatus(m.id, "ACTIVE"))} disabled={pending}>Reactivate</Action>
                        ) : (
                          <Action onClick={() => run(() => setMemberStatus(m.id, "SUSPENDED"))} disabled={pending}>Suspend</Action>
                        )}
                        {myRole === "OWNER" && (
                          <Action danger onClick={() => run(() => removeMember(m.id))} disabled={pending}>Remove</Action>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr><Td colSpan={6}><span style={{ color: "var(--kb-text-secondary)" }}>No members yet.</span></Td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteModal
          pending={pending}
          onClose={() => setShowInvite(false)}
          onSubmit={(email, role, displayName) =>
            run(async () => {
              await inviteMember({ email, role, displayName });
              setShowInvite(false);
            })
          }
        />
      )}
    </div>
  );
}

function InviteModal({
  pending,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  onClose: () => void;
  onSubmit: (email: string, role: string, displayName: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded p-5" style={{ backgroundColor: "var(--kb-surface)", boxShadow: "var(--kb-shadow-modal)", borderRadius: "var(--kb-radius)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600 }}>Invite member</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <label className="mb-2 block text-sm">Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1 w-full rounded px-2 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
        </label>
        <label className="mb-2 block text-sm">Name (optional)
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded px-2 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
        </label>
        <label className="mb-4 block text-sm">Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 w-full rounded px-2 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
            {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>Cancel</button>
          <button type="button" disabled={pending} onClick={() => onSubmit(email, role, displayName)} className="rounded px-3 py-1.5 text-sm text-white" style={{ backgroundColor: "var(--kb-primary)" }}>Send invite</button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = { ACTIVE: "var(--kb-success)", INVITED: "var(--kb-warning)", SUSPENDED: "var(--kb-error)" };
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: map[status] ?? "var(--kb-text-secondary)" }}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium">{children}</th>;
}
function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <td className="px-3 py-2" colSpan={colSpan} style={{ color: "var(--kb-text-primary)" }}>{children}</td>;
}
function Action({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="text-xs" style={{ color: danger ? "var(--kb-error)" : "var(--kb-primary)" }}>
      {children}
    </button>
  );
}
