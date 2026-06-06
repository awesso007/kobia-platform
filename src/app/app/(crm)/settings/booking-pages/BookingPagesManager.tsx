"use client";

/*
 * Booking pages manager (Sprint 12). Left: list of pages with public link. Right:
 * editor for the selected page (or a new one) including the weekly availability
 * grid (add/remove time windows per weekday).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { BookingPageRow } from "@/lib/calendar/queries";
import {
  BOOKING_LOCATION_TYPES,
  BOOKING_LOCATION_LABELS,
  DAY_LABELS_LONG,
  minutesToHHMM,
  hhmmToMinutes,
  slugFromName,
} from "@/lib/calendar/shared";
import { createBookingPage, updateBookingPage, deleteBookingPage, type AvailabilityWindow } from "./actions";

type Draft = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  timezone: string;
  active: boolean;
  color: string;
  locationType: string;
  locationDetails: string;
  requireApproval: boolean;
  redirectUrl: string;
  availability: AvailabilityWindow[];
};

function draftFrom(p: BookingPageRow): Draft {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    durationMinutes: p.durationMinutes,
    bufferBeforeMinutes: p.bufferBeforeMinutes,
    bufferAfterMinutes: p.bufferAfterMinutes,
    minNoticeMinutes: p.minNoticeMinutes,
    maxAdvanceDays: p.maxAdvanceDays,
    timezone: p.timezone,
    active: p.active,
    color: p.color,
    locationType: p.locationType,
    locationDetails: p.locationDetails ?? "",
    requireApproval: p.requireApproval,
    redirectUrl: p.redirectUrl ?? "",
    availability: p.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMinutes: a.startMinutes, endMinutes: a.endMinutes })),
  };
}

function emptyDraft(): Draft {
  return {
    name: "",
    slug: "",
    description: "",
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 60,
    maxAdvanceDays: 30,
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
    active: true,
    color: "#1d77bd",
    locationType: "VIDEO_LINK",
    requireApproval: false,
    locationDetails: "",
    redirectUrl: "",
    availability: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinutes: 540, endMinutes: 1020 })),
  };
}

export function BookingPagesManager({ pages, baseUrl }: { pages: BookingPageRow[]; baseUrl: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "w-full rounded border px-2 py-1.5 text-sm";
  const fieldStyle = { borderColor: "var(--kb-border)", borderRadius: "var(--kb-radius-sm)" } as const;
  const labelCls = "block text-xs font-medium mb-1";
  const labelStyle = { color: "var(--kb-text-secondary)" } as const;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function addWindow(day: number) {
    setDraft((d) => (d ? { ...d, availability: [...d.availability, { dayOfWeek: day, startMinutes: 540, endMinutes: 1020 }] } : d));
  }

  function removeWindow(idx: number) {
    setDraft((d) => (d ? { ...d, availability: d.availability.filter((_, i) => i !== idx) } : d));
  }

  function setWindow(idx: number, patch: Partial<AvailabilityWindow>) {
    setDraft((d) => (d ? { ...d, availability: d.availability.map((w, i) => (i === idx ? { ...w, ...patch } : w)) } : d));
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        slug: draft.slug.trim() || slugFromName(draft.name),
        description: draft.description,
        durationMinutes: draft.durationMinutes,
        bufferBeforeMinutes: draft.bufferBeforeMinutes,
        bufferAfterMinutes: draft.bufferAfterMinutes,
        minNoticeMinutes: draft.minNoticeMinutes,
        maxAdvanceDays: draft.maxAdvanceDays,
        timezone: draft.timezone,
        active: draft.active,
        color: draft.color,
        locationType: draft.locationType,
        locationDetails: draft.locationDetails,
        requireApproval: draft.requireApproval,
        redirectUrl: draft.redirectUrl,
        availability: draft.availability,
      };
      if (draft.id) await updateBookingPage(draft.id, payload);
      else await createBookingPage(payload);
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await deleteBookingPage(id);
    if (draft?.id === id) setDraft(null);
    router.refresh();
  }

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <div>
        <KbButton variant="primary" className="mb-3" onClick={() => { setDraft(emptyDraft()); setError(null); }}>
          <Plus size={16} /> New booking page
        </KbButton>
        <div className="rounded border" style={{ borderColor: "var(--kb-border)" }}>
          {pages.length === 0 && <p className="p-4 text-sm" style={{ color: "var(--kb-text-secondary)" }}>No booking pages yet.</p>}
          {pages.map((p) => (
            <div key={p.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--kb-border)" }}>
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
              <button className="flex-1 text-left" onClick={() => { setDraft(draftFrom(p)); setError(null); }}>
                <div className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>{p.name}</div>
                <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{p.durationMinutes} min - {p.bookingCount} booking{p.bookingCount === 1 ? "" : "s"}{p.active ? "" : " - inactive"}</div>
              </button>
              <a href={`${baseUrl}/book/${p.slug}`} target="_blank" rel="noreferrer" className="rounded p-1 hover:bg-gray-100" aria-label="Open public page" style={{ color: "var(--kb-primary)" }}>
                <ExternalLink size={15} />
              </a>
              <button onClick={() => remove(p.id)} aria-label="Delete" className="rounded p-1 hover:bg-gray-100" style={{ color: "var(--kb-error)" }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {draft ? (
        <div className="rounded border p-4" style={{ borderColor: "var(--kb-border)" }}>
          <h2 className="mb-3 text-base font-semibold" style={{ color: "var(--kb-text-primary)" }}>{draft.id ? "Edit booking page" : "New booking page"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} style={labelStyle}>Name</label>
              <input className={field} style={fieldStyle} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Slug</label>
              <input className={field} style={fieldStyle} value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugFromName(draft.name) || "meeting"} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} style={labelStyle}>Description</label>
              <textarea className={field} style={fieldStyle} rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Duration (min)</label>
              <input type="number" min={5} className={field} style={fieldStyle} value={draft.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Timezone</label>
              <input className={field} style={fieldStyle} value={draft.timezone} onChange={(e) => set("timezone", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Buffer before (min)</label>
              <input type="number" min={0} className={field} style={fieldStyle} value={draft.bufferBeforeMinutes} onChange={(e) => set("bufferBeforeMinutes", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Buffer after (min)</label>
              <input type="number" min={0} className={field} style={fieldStyle} value={draft.bufferAfterMinutes} onChange={(e) => set("bufferAfterMinutes", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Min notice (min)</label>
              <input type="number" min={0} className={field} style={fieldStyle} value={draft.minNoticeMinutes} onChange={(e) => set("minNoticeMinutes", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Max advance (days)</label>
              <input type="number" min={1} className={field} style={fieldStyle} value={draft.maxAdvanceDays} onChange={(e) => set("maxAdvanceDays", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Location type</label>
              <select className={field} style={fieldStyle} value={draft.locationType} onChange={(e) => set("locationType", e.target.value)}>
                {BOOKING_LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>{BOOKING_LOCATION_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>Location details</label>
              <input className={field} style={fieldStyle} value={draft.locationDetails} onChange={(e) => set("locationDetails", e.target.value)} placeholder="Link or address" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /> Active
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              <input type="checkbox" checked={draft.requireApproval} onChange={(e) => set("requireApproval", e.target.checked)} /> Require approval
            </label>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>Weekly availability</p>
            <div className="space-y-2">
              {DAY_LABELS_LONG.map((label, day) => {
                const windows = draft.availability.map((w, i) => ({ w, i })).filter(({ w }) => w.dayOfWeek === day);
                return (
                  <div key={day} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
                    {windows.length === 0 && <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Unavailable</span>}
                    {windows.map(({ w, i }) => (
                      <span key={i} className="flex items-center gap-1">
                        <input type="time" className="rounded border px-1 py-0.5 text-xs" style={fieldStyle} value={minutesToHHMM(w.startMinutes)} onChange={(e) => { const m = hhmmToMinutes(e.target.value); if (m !== null) setWindow(i, { startMinutes: m }); }} />
                        <span className="text-xs">-</span>
                        <input type="time" className="rounded border px-1 py-0.5 text-xs" style={fieldStyle} value={minutesToHHMM(w.endMinutes)} onChange={(e) => { const m = hhmmToMinutes(e.target.value); if (m !== null) setWindow(i, { endMinutes: m }); }} />
                        <button onClick={() => removeWindow(i)} aria-label="Remove window" className="rounded p-0.5 hover:bg-gray-100" style={{ color: "var(--kb-error)" }}><Trash2 size={13} /></button>
                      </span>
                    ))}
                    <button onClick={() => addWindow(day)} className="rounded px-1.5 py-0.5 text-xs" style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-secondary)" }}>+ Add</button>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="mt-3 text-sm" style={{ color: "var(--kb-error)" }}>{error}</p>}
          <div className="mt-4 flex gap-2">
            <KbButton variant="primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</KbButton>
            <KbButton variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Cancel</KbButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded border p-8 text-sm" style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}>
          Select a booking page to edit, or create a new one.
        </div>
      )}
    </div>
  );
}
