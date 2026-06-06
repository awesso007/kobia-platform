"use client";

/*
 * Calendar sync manager (Sprint 12). Google/Outlook Connect buttons show a
 * "coming in next release" notice; the working path is an ICS subscription form
 * that fetches on save and on the daily cron.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RefreshCw } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { addIcsSubscription, resyncIcsCalendar, removeExternalCalendar } from "./actions";

export type ExternalCalendarRow = {
  id: string;
  name: string;
  type: string;
  color: string;
  externalUrl: string | null;
  lastSyncedAt: string | null;
};

export function CalendarSyncManager({ calendars }: { calendars: ExternalCalendarRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const field = "rounded border px-2 py-1.5 text-sm";
  const fieldStyle = { borderColor: "var(--kb-border)", borderRadius: "var(--kb-radius-sm)" } as const;

  const icsCalendars = calendars.filter((c) => c.type === "EXTERNAL_ICS");

  async function add() {
    if (!name.trim() || !url.trim()) {
      setError("Name and ICS URL are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await addIcsSubscription({ name: name.trim(), url: url.trim() });
      if (res.error) setError(`Subscribed, but the feed could not be fetched: ${res.error}`);
      else setNotice(`Imported ${res.upserted} event${res.upserted === 1 ? "" : "s"}.`);
      setName("");
      setUrl("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add subscription.");
    } finally {
      setBusy(false);
    }
  }

  async function resync(id: string) {
    setBusy(true);
    try {
      await resyncIcsCalendar(id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await removeExternalCalendar(id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "Google Calendar", provider: "Google" },
          { label: "Outlook Calendar", provider: "Outlook" },
        ].map((p) => (
          <div key={p.provider} className="rounded border p-4" style={{ borderColor: "var(--kb-border)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>{p.label}</p>
            <p className="mb-3 mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
              Two-way sync is coming in the next release. To preview the experience, add a public ICS feed below.
            </p>
            <KbButton variant="outline" onClick={() => setNotice(`${p.provider} sync is coming in the next release. Use an ICS subscription for now.`)}>
              Connect {p.provider}
            </KbButton>
          </div>
        ))}
      </div>

      <div className="rounded border p-4" style={{ borderColor: "var(--kb-border)" }}>
        <p className="mb-1 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>Subscribe to an ICS feed</p>
        <p className="mb-3 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          Paste a public ICS URL. Events are imported now and refreshed daily.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <input className={`${field} flex-1`} style={fieldStyle} placeholder="Calendar name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={`${field} flex-1`} style={fieldStyle} placeholder="https://example.com/calendar.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
          <KbButton variant="primary" onClick={add} disabled={busy}>Subscribe</KbButton>
        </div>
        {error && <p className="mt-2 text-sm" style={{ color: "var(--kb-error)" }}>{error}</p>}
        {notice && <p className="mt-2 text-sm" style={{ color: "var(--kb-primary)" }}>{notice}</p>}
      </div>

      {icsCalendars.length > 0 && (
        <div className="rounded border" style={{ borderColor: "var(--kb-border)" }}>
          {icsCalendars.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--kb-border)" }}>
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
              <div className="flex-1">
                <div className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>{c.name}</div>
                <div className="truncate text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                  {c.externalUrl} {c.lastSyncedAt ? `- synced ${new Date(c.lastSyncedAt).toLocaleString()}` : "- not synced yet"}
                </div>
              </div>
              <button onClick={() => resync(c.id)} disabled={busy} aria-label="Resync" className="rounded p-1 hover:bg-gray-100"><RefreshCw size={15} /></button>
              <button onClick={() => remove(c.id)} disabled={busy} aria-label="Remove" className="rounded p-1 hover:bg-gray-100" style={{ color: "var(--kb-error)" }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        Note: on the Hobby plan, external calendars sync once daily. Real-time and per-minute reminders require the Pro plan.
      </p>
    </div>
  );
}
