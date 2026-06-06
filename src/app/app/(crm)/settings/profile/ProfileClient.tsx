"use client";

/*
 * Profile settings UI (Sprint 7). Edits the current user's telephony
 * preferences and saves via saveProfilePrefs.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KbButton } from "@/components/crm/ui";
import { saveProfilePrefs, type ProfilePrefs, type OutboundNumberOption } from "./actions";

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  color: "var(--kb-text-primary)",
};

export function ProfileClient({ prefs, numbers }: { prefs: ProfilePrefs; numbers: OutboundNumberOption[] }) {
  const router = useRouter();
  const [forwarding, setForwarding] = useState(prefs.callForwardingE164 ?? "");
  const [notify, setNotify] = useState(prefs.receiveCallNotifications);
  const [defaultNumber, setDefaultNumber] = useState(prefs.defaultOutboundNumberId ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveProfilePrefs({
        callForwardingE164: forwarding,
        receiveCallNotifications: notify,
        defaultOutboundNumberId: defaultNumber || null,
      });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div
      className="max-w-xl overflow-hidden p-5"
      style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}
    >
      <h2 className="mb-4" style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>Call preferences</h2>

      <label className="mb-1 block text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
        Call forwarding number
      </label>
      <input
        value={forwarding}
        onChange={(e) => setForwarding(e.target.value)}
        placeholder="+15551234567"
        className="mb-1 w-full px-2 py-1.5 text-sm"
        style={inputStyle}
      />
      <p className="mb-4 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        Incoming calls to your assigned number ring this phone. Leave blank to ring the number itself.
      </p>

      <label className="mb-1 block text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
        Default outbound number
      </label>
      <select
        value={defaultNumber}
        onChange={(e) => setDefaultNumber(e.target.value)}
        className="mb-4 w-full px-2 py-1.5 text-sm"
        style={inputStyle}
      >
        <option value="">Use my assigned number</option>
        {numbers.map((n) => (
          <option key={n.id} value={n.id}>{n.e164}</option>
        ))}
      </select>

      <label className="mb-4 flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Notify me about incoming calls and voicemails
      </label>

      <div className="flex items-center gap-3">
        <KbButton onClick={save} disabled={pending}>{pending ? "Saving..." : "Save preferences"}</KbButton>
        {saved ? <span className="text-sm" style={{ color: "var(--kb-success, #5cb85c)" }}>Saved.</span> : null}
      </div>
    </div>
  );
}
