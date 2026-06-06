"use client";

/*
 * Reschedule / cancel client (Sprint 12). Shows the current booking and lets the
 * invitee cancel it, or pick a new date + slot. Rescheduling is modeled as
 * cancel-old + book-new: we POST the new slot to the submit endpoint (reusing
 * the invitee details), then cancel the original booking. Both endpoints are
 * public and tenant-scoped by the `?t=` query.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useState } from "react";
import { KbButton } from "@/components/crm/ui";
import type { PublicBookingPage } from "../../../BookingClient";

type Slot = { startAt: string; endAt: string };

function isoDateUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function RescheduleClient({
  page,
  bookingId,
  token,
  currentStartAt,
  currentStatus,
  inviteeName,
  inviteeEmail,
  inviteePhone,
}: {
  page: PublicBookingPage;
  bookingId: string;
  token: string;
  currentStartAt: string;
  currentStatus: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string | null;
}) {
  const [mode, setMode] = useState<"view" | "pick">("view");
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"canceled" | "rescheduled" | null>(null);

  const tz = useMemo(() => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"), []);
  const alreadyClosed = currentStatus === "CANCELED";

  const dateOptions = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i <= page.maxAdvanceDays; i++) {
      const d = new Date(today.getTime() + i * 86_400_000);
      if (!page.availableWeekdays.includes(d.getUTCDay())) continue;
      out.push({ value: isoDateUTC(d), label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) });
    }
    return out;
  }, [page.availableWeekdays, page.maxAdvanceDays]);

  useEffect(() => {
    if (!date) return;
    let canceled = false;
    setLoadingSlots(true);
    setSlot(null);
    fetch(`/api/book/${encodeURIComponent(page.slug)}/slots?t=${encodeURIComponent(page.tenantSlug)}&date=${date}`)
      .then((r) => r.json())
      .then((j) => { if (!canceled) setSlots(Array.isArray(j.slots) ? j.slots : []); })
      .catch(() => { if (!canceled) setSlots([]); })
      .finally(() => { if (!canceled) setLoadingSlots(false); });
    return () => { canceled = true; };
  }, [date, page.slug, page.tenantSlug]);

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  async function cancelBooking() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${encodeURIComponent(page.slug)}/cancel?t=${encodeURIComponent(page.tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, token }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setError(j.error || "Could not cancel."); return; }
      setResult("canceled");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReschedule() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      // Book the new slot first so we never cancel without a replacement.
      const res = await fetch(`/api/book/${encodeURIComponent(page.slug)}/submit?t=${encodeURIComponent(page.tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: slot.startAt, name: inviteeName, email: inviteeEmail, phone: inviteePhone ?? "", timezone: tz }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setError(j.error || "Could not reschedule."); return; }
      // Cancel the original (best-effort; the new booking already exists).
      await fetch(`/api/book/${encodeURIComponent(page.slug)}/cancel?t=${encodeURIComponent(page.tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, token }),
      }).catch(() => {});
      setResult("rescheduled");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const whenLabel = new Date(currentStartAt).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  if (result) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {result === "canceled" ? "Booking canceled" : "Booking rescheduled"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {result === "canceled" ? "Your booking has been canceled." : "Your new time is confirmed. A confirmation is on its way."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b p-5" style={{ borderColor: "var(--kb-border)", borderTop: `4px solid ${page.color}` }}>
        <h1 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>Manage your booking</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{page.name} - {whenLabel}</p>
        {alreadyClosed && <p className="mt-2 text-sm" style={{ color: "var(--kb-error)" }}>This booking is already canceled.</p>}
      </div>

      {!alreadyClosed && mode === "view" && (
        <div className="flex flex-wrap gap-2 p-5">
          <KbButton variant="primary" onClick={() => setMode("pick")} disabled={busy}>Reschedule</KbButton>
          <KbButton variant="outline" onClick={cancelBooking} disabled={busy}>{busy ? "Working..." : "Cancel booking"}</KbButton>
        </div>
      )}

      {!alreadyClosed && mode === "pick" && (
        <div>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>Pick a new date</p>
              <div className="flex max-h-72 flex-col gap-1 overflow-auto pr-1">
                {dateOptions.map((d) => (
                  <button key={d.value} onClick={() => setDate(d.value)} className="rounded border px-3 py-2 text-left text-sm"
                    style={{ borderColor: date === d.value ? page.color : "var(--kb-border)", color: "var(--kb-text-primary)" }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>Pick a new time</p>
              {!date && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Select a date first.</p>}
              {date && loadingSlots && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading times...</p>}
              {date && !loadingSlots && slots.length === 0 && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No open times.</p>}
              <div className="grid max-h-72 grid-cols-2 gap-1 overflow-auto pr-1">
                {slots.map((s) => (
                  <button key={s.startAt} onClick={() => setSlot(s)} className="rounded border px-2 py-2 text-sm"
                    style={{ borderColor: slot?.startAt === s.startAt ? page.color : "var(--kb-border)", backgroundColor: slot?.startAt === s.startAt ? page.color : "transparent", color: slot?.startAt === s.startAt ? "#fff" : "var(--kb-text-primary)" }}>
                    {fmtTime(s.startAt)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="px-5 text-sm" style={{ color: "var(--kb-error)" }}>{error}</p>}
          <div className="flex gap-2 p-5 pt-2">
            <KbButton variant="primary" onClick={confirmReschedule} disabled={busy || !slot}>{busy ? "Saving..." : "Confirm new time"}</KbButton>
            <KbButton variant="ghost" onClick={() => setMode("view")} disabled={busy}>Back</KbButton>
          </div>
        </div>
      )}

      {error && mode === "view" && <p className="px-5 pb-5 text-sm" style={{ color: "var(--kb-error)" }}>{error}</p>}
    </div>
  );
}
