"use client";

import { useState } from "react";
import {
  enableInvoicePortal,
  disableInvoicePortal,
} from "@/app/actions/invoice-portal-actions";

export function SharePortalButton({
  tenantSlug,
  invoiceId,
  publicViewToken,
}: {
  tenantSlug: string;
  invoiceId: string;
  publicViewToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  const portalUrl =
    publicViewToken && typeof window !== "undefined"
      ? `${window.location.origin}/pay/${publicViewToken}`
      : null;

  async function handleEnable() {
    setPending(true);
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("invoiceId", invoiceId);
    try {
      await enableInvoicePortal(fd);
    } finally {
      setPending(false);
    }
  }

  async function handleDisable() {
    if (
      !confirm(
        "Disable the customer portal link? The current link will stop working."
      )
    )
      return;
    setPending(true);
    const fd = new FormData();
    fd.set("tenantSlug", tenantSlug);
    fd.set("invoiceId", invoiceId);
    try {
      await disableInvoicePortal(fd);
    } finally {
      setPending(false);
    }
  }

  async function handleCopy() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Share with customer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Customer payment portal
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Send this link to your customer. They&apos;ll see a clean,
              printable invoice with the balance due — no login required.
            </p>

            {portalUrl ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={portalUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    Preview portal →
                  </a>
                  <button
                    type="button"
                    onClick={handleDisable}
                    disabled={pending}
                    className="text-sm font-medium text-rose-700 hover:underline disabled:opacity-50"
                  >
                    Disable link
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={pending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {pending ? "Generating…" : "Generate portal link"}
                </button>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
