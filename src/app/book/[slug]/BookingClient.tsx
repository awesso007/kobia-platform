"use client";

/*
 * Public booking client (Sprint 12). Three-step scheduler: (1) pick a date,
 * (2) pick a slot fetched from /api/book/[slug]/slots, (3) fill details and
 * submit to /api/book/[slug]/submit. Unauthenticated; tenant slug is carried in
 * the `?t=` query that the page resolved server-side.
 *
 * Slot times come back as UTC ISO strings (the booking engine treats
 * availability windows as wall-clock UTC for v0.3); we render them in the
 * viewer's local time with Intl so the label matches what they expect.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useState } from "react";
import { KbButton } from "@/components/crm/ui";
import { BOOKING_LOCATION_LABELS } from "@/lib/calendar/shared";

export type PublicBookingPage = {
  tenantSlug: string;
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  timezone: string;
  color: string;
  locationType: string;
  locationDetails: string | null;
  requireApproval: boolean;
  customQuestions: Array<{ id: string; label: string; type: "text" | "textarea"; required: boolean }>;
  availableWeekdays: number[];
};

type Slot = { startAt: string; endAt: string };

function isoDateUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function BookingClient({ page }: { page: PublicBookingPage }) {
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ rescheduleToken: string; bookingId: string } | null>(null);

  const tz = useMemo(() => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"), []);

  // Candidate dates: from today through maxAdvanceDays, only weekdays the page is available.
  const dateOptions = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i <= page.maxAdvanceDays; i++) {
      const d = new Date(today.getTime() + i * 86_400_000);
      if (!page.availableWeekdays.includes(d.getUTCDay())) continue;
      out.push({
        value: isoDateUTC(d),
        label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
      });
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
      .then((j) => {
        if (canceled) return;
        setSlots(Array.isArray(j.slots) ? j.slots : []);
      })
      .catch(() => {
        if (!canceled) setSlots([]);
      })
      .finally(() => {
        if (!canceled) setLoadingSlots(false);
      });
    return () => {
      canceled = true;
    };
  }, [date, page.slug, page.tenantSlug]);

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  async function submit() {
    if (!slot) return;
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    for (const q of page.customQuestions) {
      if (q.required && !(answers[q.id] ?? "").trim()) {
        setError(`${q.label} is required.`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${encodeURIComponent(page.slug)}/submit?t=${encodeURIComponent(page.tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: slot.startAt, name: name.trim(), email: email.trim(), phone: phone.trim(), timezone: tz, answers }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error || "Could not complete the booking.");
        return;
      }
      if (j.redirectUrl) {
        window.location.href = j.redirectUrl;
        return;
      }
      setDone({ rescheduleToken: j.rescheduleToken, bookingId: j.bookingId });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded border px-2 py-1.5 text-sm";
  const fieldStyle = { borderColor: "var(--kb-border)", borderRadius: "var(--kb-radius-sm)" } as const;

  if (done) {
    return (
      <Confirmation
        page={page}
        slot={slot!}
        rescheduleToken={done.rescheduleToken}
        bookingId={done.bookingId}
        attendeeName={name}
        tz={tz}
        fmtTime={fmtTime}
      />
    );
  }

  return (
    <div>
      <div className="border-b p-5" style={{ borderColor: "var(--kb-border)", borderTop: `4px solid ${page.color}` }}>
        <h1 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>{page.name}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {page.durationMinutes} min - {BOOKING_LOCATION_LABELS[page.locationType] ?? page.locationType}
          {page.locationType === "VIDEO_LINK" || page.locationType === "PHONE" ? "" : page.locationDetails ? ` - ${page.locationDetails}` : ""}
        </p>
        {page.description && <p className="mt-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{page.description}</p>}
        <p className="mt-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>Times shown in your timezone ({tz}).</p>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>1. Pick a date</p>
          {dateOptions.length === 0 && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No availability.</p>}
          <div className="flex max-h-72 flex-col gap-1 overflow-auto pr-1">
            {dateOptions.map((d) => (
              <button
                key={d.value}
                onClick={() => setDate(d.value)}
                className="rounded border px-3 py-2 text-left text-sm"
                style={{
                  borderColor: date === d.value ? page.color : "var(--kb-border)",
                  backgroundColor: date === d.value ? "var(--kb-surface-grey)" : "transparent",
                  color: "var(--kb-text-primary)",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>2. Pick a time</p>
          {!date && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Select a date first.</p>}
          {date && loadingSlots && <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading times...</p>}
          {date && !loadingSlots && slots.length === 0 && (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No open times on this day.</p>
          )}
          <div className="grid max-h-72 grid-cols-2 gap-1 overflow-auto pr-1">
            {slots.map((s) => (
              <button
                key={s.startAt}
                onClick={() => setSlot(s)}
                className="rounded border px-2 py-2 text-sm"
                style={{
                  borderColor: slot?.startAt === s.startAt ? page.color : "var(--kb-border)",
                  backgroundColor: slot?.startAt === s.startAt ? page.color : "transparent",
                  color: slot?.startAt === s.startAt ? "#fff" : "var(--kb-text-primary)",
                }}
              >
                {fmtTime(s.startAt)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {slot && (
        <div className="border-t p-5" style={{ borderColor: "var(--kb-border)" }}>
          <p className="mb-3 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
            3. Your details
            <span className="ml-2 font-normal" style={{ color: "var(--kb-text-secondary)" }}>
              {new Date(slot.startAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Name</label>
              <input className={field} style={fieldStyle} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Email</label>
              <input className={field} style={fieldStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Phone (optional)</label>
              <input className={field} style={fieldStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {page.customQuestions.map((q) => (
              <div key={q.id} className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
                  {q.label}{q.required ? " *" : ""}
                </label>
                {q.type === "textarea" ? (
                  <textarea className={field} style={fieldStyle} rows={2} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                ) : (
                  <input className={field} style={fieldStyle} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-sm" style={{ color: "var(--kb-error)" }}>{error}</p>}
          <div className="mt-4">
            <KbButton variant="primary" onClick={submit} disabled={busy}>
              {busy ? "Booking..." : page.requireApproval ? "Request booking" : "Confirm booking"}
            </KbButton>
          </div>
        </div>
      )}
    </div>
  );
}

function Confirmation({
  page,
  slot,
  rescheduleToken,
  bookingId,
  attendeeName,
  tz,
  fmtTime,
}: {
  page: PublicBookingPage;
  slot: Slot;
  rescheduleToken: string;
  bookingId: string;
  attendeeName: string;
  tz: string;
  fmtTime: (iso: string) => string;
}) {
  const start = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  const whenLabel = `${start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${fmtTime(slot.startAt)}`;

  // Calendar add links. Google/Outlook take UTC times in compact ISO.
  const fmtCal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const title = encodeURIComponent(page.name);
  const details = encodeURIComponent(page.description ?? "");
  const loc = encodeURIComponent(page.locationDetails ?? "");
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmtCal(start)}/${fmtCal(end)}&details=${details}&location=${loc}`;
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${encodeURIComponent(start.toISOString())}&enddt=${encodeURIComponent(end.toISOString())}&body=${details}&location=${loc}`;
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `DTSTART:${fmtCal(start)}`, `DTEND:${fmtCal(end)}`, `SUMMARY:${page.name}`, page.locationDetails ? `LOCATION:${page.locationDetails}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n"),
  )}`;

  const manageUrl = `/book/${encodeURIComponent(page.slug)}/reschedule/${encodeURIComponent(bookingId)}/${encodeURIComponent(rescheduleToken)}?t=${encodeURIComponent(page.tenantSlug)}`;

  return (
    <div className="p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: page.color, color: "#fff", fontSize: 24 }}>
        +
      </div>
      <h1 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        {page.requireApproval ? "Booking requested" : "You are booked"}
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        {page.requireApproval ? "Your request is pending confirmation." : `Thanks ${attendeeName || "you"}, a confirmation is on its way.`}
      </p>
      <div className="mx-auto mt-4 max-w-sm rounded border p-4 text-left" style={{ borderColor: "var(--kb-border)" }}>
        <p className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>{page.name}</p>
        <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>{whenLabel}</p>
        <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{page.durationMinutes} min - {tz}</p>
      </div>

      <p className="mt-4 text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Add to calendar</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <a href={googleUrl} target="_blank" rel="noreferrer"><KbButton variant="outline">Google</KbButton></a>
        <a href={outlookUrl} target="_blank" rel="noreferrer"><KbButton variant="outline">Outlook</KbButton></a>
        <a href={icsHref} download={`${page.slug}.ics`}><KbButton variant="outline">ICS</KbButton></a>
      </div>

      <p className="mt-5 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        Need to change this? <a href={manageUrl} style={{ color: "var(--kb-primary)" }}>Reschedule or cancel</a>
      </p>
    </div>
  );
}
