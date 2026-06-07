"use client";

/*
 * Public signing form (Sprint 14). Collects a typed signature and posts it to
 * the e-sign complete endpoint. On success the page reloads to show the signed
 * state. Unauthenticated - the signer token is the only credential.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";

export function SignForm({ token, tenant, signerName }: { token: string; tenant: string; signerName: string }) {
  const [name, setName] = useState(signerName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Please type your full name to sign.");
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/esign/${token}/complete?t=${encodeURIComponent(tenant)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signatureData: name.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not record your signature.");
        setSubmitting(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Sign this document</h2>
      <p className="mt-1 text-xs text-slate-500">
        By typing your name and clicking Sign, you agree to electronically sign this document.
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-slate-700">Type your full name *</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm"
        />
      </label>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50"
        >
          {submitting ? "Signing..." : "Sign"}
        </button>
      </div>
    </form>
  );
}
