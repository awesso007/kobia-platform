"use client";

/*
 * Unsubscribe confirmation client (Sprint 13). Posts { email, tenant, reason? }
 * to /api/unsubscribe and shows a confirmation. Tenant slug comes from the
 * server wrapper (validated `?t=`); email is prefilled but editable.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";

export function UnsubscribeClient({
  initialEmail,
  tenantSlug,
}: {
  initialEmail: string;
  tenantSlug: string | null;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!tenantSlug) {
      setError("This unsubscribe link is missing its tenant. Please use the link from your email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/unsubscribe?t=${encodeURIComponent(tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tenant: tenantSlug, reason: reason.trim() || undefined }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "We could not process your request. Please try again.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("We could not process your request. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        {done ? (
          <>
            <h1 style={titleStyle}>You are unsubscribed</h1>
            <p style={bodyStyle}>
              {email} will no longer receive marketing messages from us. You can close this page.
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 style={titleStyle}>Unsubscribe</h1>
            <p style={bodyStyle}>
              Confirm the email address below to stop receiving marketing messages.
            </p>
            <label style={labelStyle} htmlFor="unsub-email">
              Email
            </label>
            <input
              id="unsub-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@example.com"
            />
            <label style={labelStyle} htmlFor="unsub-reason">
              Reason (optional)
            </label>
            <textarea
              id="unsub-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              placeholder="Tell us why (optional)"
            />
            {error ? <p style={errorStyle}>{error}</p> : null}
            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? "Processing..." : "Unsubscribe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f6f8",
  fontFamily: "sans-serif",
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "#fff",
  border: "1px solid #e2e6ea",
  borderRadius: 10,
  padding: 28,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const titleStyle: React.CSSProperties = { fontSize: 20, fontWeight: 600, color: "#1a2733", margin: "0 0 8px" };
const bodyStyle: React.CSSProperties = { fontSize: 14, color: "#566573", margin: "0 0 20px", lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#1a2733", margin: "0 0 6px" };
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: 14,
  border: "1px solid #cdd5dd",
  borderRadius: 6,
  marginBottom: 16,
  color: "#1a2733",
};
const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  background: "#1d77bd",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
const errorStyle: React.CSSProperties = { fontSize: 13, color: "#c0392b", margin: "0 0 12px" };
