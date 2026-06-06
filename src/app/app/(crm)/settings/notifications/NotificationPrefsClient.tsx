"use client";

/*
 * Notification preference toggles (Sprint 5). One row per notification type with
 * an in-app and an email checkbox. Changes persist immediately via the
 * setNotificationPref server action (optimistic). Email is a v0.1 stub - the
 * flag is stored but no email is sent yet.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { setNotificationPref } from "./actions";

export type PrefRow = {
  type: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
};

export function NotificationPrefsClient({ rows }: { rows: PrefRow[] }) {
  const [state, setState] = useState<PrefRow[]>(rows);
  const [, start] = useTransition();

  function toggle(type: string, channel: "inApp" | "email", enabled: boolean) {
    setState((prev) => prev.map((r) => (r.type === type ? { ...r, [channel]: enabled } : r)));
    start(() => {
      void setNotificationPref({ type, channel, enabled });
    });
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2 text-xs" style={{ color: "var(--kb-text-secondary)", borderBottom: "1px solid var(--kb-border)" }}>
          <div>Notification type</div>
          <div className="w-16 text-center">In-app</div>
          <div className="w-16 text-center">Email</div>
        </div>
        {state.map((r) => (
          <div key={r.type} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3" style={{ borderBottom: "1px solid var(--kb-border)" }}>
            <div>
              <div className="text-sm" style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>{r.label}</div>
              <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{r.description}</div>
            </div>
            <label className="flex w-16 justify-center">
              <input type="checkbox" checked={r.inApp} onChange={(e) => toggle(r.type, "inApp", e.target.checked)} />
            </label>
            <label className="flex w-16 justify-center">
              <input type="checkbox" checked={r.email} onChange={(e) => toggle(r.type, "email", e.target.checked)} />
            </label>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        Email delivery is not active yet in v0.1 - the preference is saved for when email is enabled.
      </div>
    </div>
  );
}
