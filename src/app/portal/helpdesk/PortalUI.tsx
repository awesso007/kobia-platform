"use client";

/*
 * Customer helpdesk portal client widgets (Sprint 15). Login, new-ticket, and
 * reply forms that call the public /api/portal routes. Tenant is passed in from
 * the server pages (resolved from `?t=`). These are namespaced under
 * /portal/helpdesk to avoid colliding with the existing client portal at
 * /portal.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls = "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";
const btnPrimary = "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";

function withTenant(path: string, tenant: string) {
  return `${path}?t=${encodeURIComponent(tenant)}`;
}

export function PortalLogin({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(withTenant("/api/portal/login", tenant), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setErr(data.error ?? "Could not sign in.");
        return;
      }
      router.push(withTenant("/portal/helpdesk", tenant));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {err ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
      <input
        className={inputCls}
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className={btnPrimary} disabled={busy || !email.trim()} onClick={submit}>
        {busy ? "Signing in..." : "Continue"}
      </button>
    </div>
  );
}

export function PortalNewTicket({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ subject: "", description: "", priority: "NORMAL" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.subject.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(withTenant("/api/portal/tickets", tenant), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok: boolean; id?: string; error?: string };
      if (!data.ok || !data.id) {
        setErr(data.error ?? "Could not create ticket.");
        return;
      }
      router.push(withTenant(`/portal/helpdesk/tickets/${data.id}`, tenant));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {err ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
      <input
        className={inputCls}
        placeholder="Subject"
        value={form.subject}
        onChange={(e) => set("subject", e.target.value)}
      />
      <textarea
        className={inputCls}
        rows={6}
        placeholder="How can we help?"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <select className={inputCls} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
        {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button className={btnPrimary} disabled={busy || !form.subject.trim()} onClick={submit}>
        {busy ? "Submitting..." : "Submit ticket"}
      </button>
    </div>
  );
}

export function PortalReply({ tenant, ticketId }: { tenant: string; ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(withTenant(`/api/portal/tickets/${ticketId}/reply`, tenant), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyHtml: body }),
      });
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className={inputCls}
        rows={4}
        placeholder="Add a reply"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button className={btnPrimary} disabled={busy || !body.trim()} onClick={submit}>
        {busy ? "Sending..." : "Send reply"}
      </button>
    </div>
  );
}

export function PortalSignOut({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await fetch(withTenant("/api/portal/logout", tenant), { method: "POST" });
      router.push(withTenant("/portal/helpdesk", tenant));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      disabled={busy}
      onClick={signOut}
      className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
