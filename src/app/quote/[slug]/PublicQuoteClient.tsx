"use client";

/*
 * Public quote renderer (Sprint 10). Print-ready document with an Accept button
 * and a Request changes box, both wired to the public server actions. No auth;
 * the parent page already resolved the tenant from `?t=<slug>` and gated on the
 * unguessable publicSlug.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { acceptQuote, requestQuoteChanges } from "./actions";

export type PublicQuoteData = {
  tenantSlug: string;
  slug: string;
  number: string;
  title: string;
  status: string;
  currency: string;
  primaryColor: string;
  notes: string | null;
  terms: string | null;
  expiresAt: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  contactName: string | null;
  companyName: string | null;
  lineItems: {
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unitPriceCents: number;
    discountPct: number;
    taxRatePct: number;
    lineTotalCents: number;
  }[];
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}

export function PublicQuoteClient({ data }: { data: PublicQuoteData }) {
  const [status, setStatus] = useState(data.status);
  const [pending, startTransition] = useTransition();
  const [showChanges, setShowChanges] = useState(false);
  const [message, setMessage] = useState("");
  const [changesSent, setChangesSent] = useState(false);

  const accepted = status === "ACCEPTED";
  const decided = accepted || status === "DECLINED";

  function accept() {
    startTransition(async () => {
      await acceptQuote(data.tenantSlug, data.slug);
      setStatus("ACCEPTED");
    });
  }

  function sendChanges() {
    const note = message.trim();
    if (!note) return;
    startTransition(async () => {
      await requestQuoteChanges(data.tenantSlug, data.slug, note);
      setChangesSent(true);
      setShowChanges(false);
      setMessage("");
    });
  }

  return (
    <div>
      <div style={{ height: 6, backgroundColor: data.primaryColor, borderTopLeftRadius: "var(--kb-radius)", borderTopRightRadius: "var(--kb-radius)" }} />
      <div className="p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{data.title}</h1>
            <div className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)", fontFamily: "monospace" }}>{data.number}</div>
          </div>
          <div className="text-right text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            {data.companyName ? <div style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{data.companyName}</div> : null}
            {data.contactName ? <div>{data.contactName}</div> : null}
            {data.expiresAt ? <div className="mt-1">Valid until {data.expiresAt}</div> : null}
          </div>
        </div>

        {accepted ? (
          <div className="mb-5 rounded px-4 py-3 text-sm" style={{ backgroundColor: "var(--kb-surface-grey)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-success)" }}>
            This quote has been accepted. Thank you.
          </div>
        ) : null}
        {changesSent ? (
          <div className="mb-5 rounded px-4 py-3 text-sm" style={{ backgroundColor: "var(--kb-surface-grey)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }}>
            Your change request has been sent. We will be in touch shortly.
          </div>
        ) : null}

        <div style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", overflow: "hidden" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--kb-text-secondary)", borderBottom: "1px solid var(--kb-border)" }}>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-2 py-2 text-right font-medium" style={{ width: 54 }}>Qty</th>
                <th className="px-2 py-2 text-right font-medium" style={{ width: 96 }}>Price</th>
                <th className="px-3 py-2 text-right font-medium" style={{ width: 110 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.lineItems.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center" style={{ color: "var(--kb-text-secondary)" }}>No line items.</td></tr>
              ) : data.lineItems.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-primary)" }}>
                    <div>{l.name}</div>
                    {l.description ? <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{l.description}</div> : null}
                  </td>
                  <td className="px-2 py-2 text-right" style={{ color: "var(--kb-text-secondary)" }}>{l.quantity}</td>
                  <td className="px-2 py-2 text-right" style={{ color: "var(--kb-text-secondary)" }}>{money(l.unitPriceCents, data.currency)}</td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{money(l.lineTotalCents, data.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 px-4 py-3 text-sm" style={{ backgroundColor: "var(--kb-surface-grey)" }}>
            <Row label="Subtotal" value={money(data.subtotalCents, data.currency)} />
            {data.discountCents > 0 ? <Row label="Discount" value={`-${money(data.discountCents, data.currency)}`} /> : null}
            <Row label="Tax" value={money(data.taxCents, data.currency)} />
            <Row label="Total" value={money(data.totalCents, data.currency)} strong />
          </div>
        </div>

        {data.notes ? (
          <div className="mt-5">
            <div className="mb-1 text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Notes</div>
            <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-primary)" }}>{data.notes}</p>
          </div>
        ) : null}
        {data.terms ? (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Terms and conditions</div>
            <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-secondary)" }}>{data.terms}</p>
          </div>
        ) : null}

        {!decided ? (
          <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={accept}
              disabled={pending}
              className="rounded px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: data.primaryColor, color: "#fff", borderRadius: "var(--kb-radius-sm)", opacity: pending ? 0.6 : 1 }}
            >
              {pending ? "Working..." : "Accept quote"}
            </button>
            <button
              type="button"
              onClick={() => setShowChanges((v) => !v)}
              className="rounded px-4 py-2 text-sm"
              style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}
            >
              Request changes
            </button>
          </div>
        ) : null}

        {showChanges && !decided ? (
          <div className="mt-3 print:hidden">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="What would you like changed?"
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={sendChanges}
                disabled={pending || !message.trim()}
                className="rounded px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: "var(--kb-primary)", color: "#fff", borderRadius: "var(--kb-radius-sm)", opacity: pending || !message.trim() ? 0.6 : 1 }}
              >
                Send request
              </button>
              <button type="button" onClick={() => setShowChanges(false)} className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Cancel</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--kb-text-primary)", fontWeight: strong ? 600 : 400, fontSize: strong ? "1rem" : undefined }}>{value}</span>
    </div>
  );
}
