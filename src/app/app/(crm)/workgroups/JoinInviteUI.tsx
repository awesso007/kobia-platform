"use client";

/*
 * Invite acceptance UI (Sprint 22). "use client" and exports ONLY React
 * components. POSTs the invite token to /api/workgroups/invites/[token]/accept
 * and, on success, sends the user into the group.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  return res.json().catch(() => ({ ok: false }));
}

export function JoinInvite({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function accept() {
    start(async () => {
      const res = await api(`/api/workgroups/invites/${token}/accept`, { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) {
        setMsg(res.error || "This invite is invalid or has expired.");
        return;
      }
      router.push(res.slug ? `/app/workgroups/${res.slug}` : "/app/workgroups");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>You have been invited to join a workgroup.</p>
      {msg && <p className="text-sm" style={{ color: "var(--kb-danger, #dc2626)" }}>{msg}</p>}
      <button type="button" onClick={accept} disabled={pending} className="self-start rounded px-4 py-2 text-sm font-medium" style={{ backgroundColor: "var(--kb-primary, #2563eb)", color: "#fff", opacity: pending ? 0.6 : 1 }}>
        {pending ? "Joining..." : "Accept invite"}
      </button>
    </div>
  );
}
