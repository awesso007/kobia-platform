"use client";

/*
 * Click-to-call button + popover (Sprint 7). Renders a small "Call" button that
 * opens a 300px popover showing the target number and a Call action. POSTs to
 * /api/calls/dial; surfaces the result inline. Works in "not configured" mode -
 * the API logs the Call and returns a friendly notice.
 *
 * Pass the CRM link ids so the resulting Call attaches to the right record.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { Phone, X } from "lucide-react";

export type CallTarget = {
  toE164: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
  companyId?: string;
};

export function CallButton({ target, compact }: { target: CallTarget; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  if (!target.toE164) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
        style={{ color: "var(--kb-primary)", border: compact ? "none" : "1px solid var(--kb-border)" }}
        title={`Call ${target.toE164}`}
      >
        <Phone size={13} /> {compact ? null : "Call"}
      </button>
      {open ? <CallPopover target={target} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

function CallPopover({ target, onClose }: { target: CallTarget; onClose: () => void }) {
  const [status, setStatus] = useState<"idle" | "dialing" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function dial() {
    setStatus("dialing");
    setMessage(null);
    try {
      const res = await fetch("/api/calls/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setStatus("done");
        setMessage(data.error ?? "Call placed. Your phone will ring to connect.");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Could not place the call.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(String(err instanceof Error ? err.message : err));
    }
  }

  return (
    <div
      className="absolute right-0 z-50 mt-1 p-3"
      style={{
        width: 300,
        backgroundColor: "var(--kb-surface)",
        border: "1px solid var(--kb-border)",
        borderRadius: "var(--kb-radius)",
        boxShadow: "var(--kb-shadow-card)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>Call</span>
        <button type="button" onClick={onClose} style={{ color: "var(--kb-text-secondary)" }}><X size={15} /></button>
      </div>
      <div className="mb-3 text-sm" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{target.toE164}</div>

      {message ? (
        <div
          className="mb-3 rounded px-2 py-1.5 text-xs"
          style={
            status === "error"
              ? { backgroundColor: "#fbeaea", border: "1px solid var(--kb-error)", color: "var(--kb-error)" }
              : { backgroundColor: "#eef7ee", border: "1px solid #cce5cc", color: "#2f6f2f" }
          }
        >
          {message}
        </div>
      ) : null}

      {status !== "done" ? (
        <button
          type="button"
          onClick={dial}
          disabled={status === "dialing"}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: "var(--kb-primary)", color: "#fff" }}
        >
          <Phone size={14} /> {status === "dialing" ? "Dialing..." : "Call now"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded py-1.5 text-sm font-medium"
          style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)" }}
        >
          Close
        </button>
      )}
    </div>
  );
}
