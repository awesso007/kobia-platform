"use client";

/*
 * Password gate for protected document share links (Sprint 14). Submits the
 * password as a `?pw=` query param so the server page can verify it against the
 * stored scrypt hash and render the document. Unauthenticated.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";

export function PasswordGate({ token, tenant, error }: { token: string; tenant: string; error?: boolean }) {
  const [pw, setPw] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set("t", tenant);
    url.searchParams.set("pw", pw);
    window.location.href = url.toString();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">This document is password protected</h2>
      <p className="mt-1 text-xs text-slate-500">Enter the password to view it.</p>
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        className="mt-3 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm"
        placeholder="Password"
      />
      {error ? <p className="mt-2 text-xs text-rose-700">Incorrect password. Please try again.</p> : null}
      <div className="mt-4 flex justify-end">
        <button type="submit" className="rounded-md bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500">
          View document
        </button>
      </div>
    </form>
  );
}
