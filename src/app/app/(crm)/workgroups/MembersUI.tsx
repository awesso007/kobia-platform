"use client";

/*
 * Workgroup members management (Sprint 22). "use client" and exports ONLY React
 * components. Owners/moderators can invite (by user id or email), promote/demote
 * moderators, remove members, and approve/reject join requests. All calls hit
 * /api/workgroups/[id]/** and refresh the route.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { canManage } from "@/lib/workgroups/workgroup-utils";

type Member = { id: string; userId: string; role: string; displayName: string | null; email: string | null };
type Invite = { id: string; inviteeUserId: string | null; inviteeEmail: string | null; status: string };
type JoinReq = { id: string; userId: string; message: string | null; requesterName: string };
type Directory = { clerkUserId: string; displayName: string | null; email: string | null };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  return res.json().catch(() => ({ ok: false }));
}

const input = { border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", backgroundColor: "var(--kb-bg)", color: "var(--kb-text-primary)" } as const;
const section = { backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" } as const;

export function MembersPanel({
  groupId,
  myRole,
  members,
  invites,
  joinRequests,
  directory,
}: {
  groupId: string;
  myRole: string | null;
  members: Member[];
  invites: Invite[];
  joinRequests: JoinReq[];
  directory: Directory[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inviteUser, setInviteUser] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const manages = canManage(myRole);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) setMsg(res.error || "Action failed.");
      else setMsg(null);
      router.refresh();
    });
  }

  function invite() {
    const body = inviteUser.trim() ? { userId: inviteUser.trim() } : inviteEmail.trim() ? { email: inviteEmail.trim() } : null;
    if (!body) {
      setMsg("Pick a user or enter an email.");
      return;
    }
    run(async () => {
      const res = await api(`/api/workgroups/${groupId}/members`, { method: "POST", body: JSON.stringify(body) });
      if (res.ok) { setInviteUser(""); setInviteEmail(""); }
      return res;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {manages && joinRequests.length > 0 && (
        <section className="p-4" style={section}>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Join requests ({joinRequests.length})</h3>
          {joinRequests.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-t py-2" style={{ borderColor: "var(--kb-border)" }}>
              <div>
                <p className="text-sm" style={{ color: "var(--kb-text-primary)" }}>{r.requesterName}</p>
                {r.message && <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{r.message}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => run(() => api(`/api/workgroups/${groupId}/join-requests/${r.id}/approve`, { method: "POST" }))} className="rounded px-3 py-1 text-xs font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff" }}>Approve</button>
                <button type="button" disabled={pending} onClick={() => run(() => api(`/api/workgroups/${groupId}/join-requests/${r.id}/reject`, { method: "POST" }))} className="rounded px-3 py-1 text-xs" style={input}>Reject</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {manages && (
        <section className="p-4" style={section}>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Invite a member</h3>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Existing user</label>
              <select value={inviteUser} onChange={(e) => { setInviteUser(e.target.value); setInviteEmail(""); }} className="p-2 text-sm" style={input}>
                <option value="">Select a user</option>
                {directory.map((d) => <option key={d.clerkUserId} value={d.clerkUserId}>{d.displayName ?? d.email ?? d.clerkUserId}</option>)}
              </select>
            </div>
            <span className="pb-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>or</span>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>By email</label>
              <input value={inviteEmail} onChange={(e) => { setInviteEmail(e.target.value); setInviteUser(""); }} placeholder="name@example.com" className="p-2 text-sm" style={input} />
            </div>
            <button type="button" onClick={invite} disabled={pending} className="rounded px-3 py-2 text-sm font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff" }}>Invite</button>
          </div>
          {invites.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Pending invites</p>
              {invites.map((i) => (
                <p key={i.id} className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{i.inviteeEmail ?? i.inviteeUserId ?? "unknown"}</p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="p-4" style={section}>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Members ({members.length})</h3>
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between border-t py-2" style={{ borderColor: "var(--kb-border)" }}>
            <div>
              <p className="text-sm" style={{ color: "var(--kb-text-primary)" }}>{m.displayName ?? m.email ?? m.userId}</p>
              <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{m.role}</p>
            </div>
            {manages && m.role !== "OWNER" && (
              <div className="flex gap-2">
                {m.role === "MEMBER" ? (
                  <button type="button" disabled={pending} onClick={() => run(() => api(`/api/workgroups/${groupId}/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ role: "MODERATOR" }) }))} className="rounded px-2 py-1 text-xs" style={input}>Promote</button>
                ) : (
                  <button type="button" disabled={pending} onClick={() => run(() => api(`/api/workgroups/${groupId}/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ role: "MEMBER" }) }))} className="rounded px-2 py-1 text-xs" style={input}>Demote</button>
                )}
                <button type="button" disabled={pending} onClick={() => run(() => api(`/api/workgroups/${groupId}/members/${m.id}`, { method: "DELETE" }))} className="rounded px-2 py-1 text-xs" style={{ ...input, color: "var(--kb-danger, #dc2626)" }}>Remove</button>
              </div>
            )}
          </div>
        ))}
      </section>

      {msg && <p className="text-sm" style={{ color: "var(--kb-danger, #dc2626)" }}>{msg}</p>}
    </div>
  );
}
