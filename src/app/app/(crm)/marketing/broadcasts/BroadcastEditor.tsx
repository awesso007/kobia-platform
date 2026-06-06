"use client";

/*
 * Broadcast editor / wizard (Sprint 13). Edits name, channel, segment, from
 * fields, and body, then schedules the send (now or future). Used for both
 * create and the detail/edit surface. Once a broadcast leaves DRAFT the form
 * locks to read-only and shows stats.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBroadcast, updateBroadcast, deleteBroadcast, sendBroadcastAction } from "../actions";
import { PageHeader, Card, MarketingBadge } from "../MarketingUI";

type SegmentLite = { id: string; name: string; entityType: string };
type Stats = Record<string, number> | null;

export function BroadcastEditor({
  broadcast,
  segments,
}: {
  broadcast?: {
    id: string;
    name: string;
    channel: string;
    subject: string | null;
    fromName: string | null;
    fromEmail: string | null;
    fromNumber: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    segmentId: string | null;
    status: string;
    statsJson: unknown;
  };
  segments: SegmentLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const locked = !!broadcast && broadcast.status !== "DRAFT";

  const [name, setName] = useState(broadcast?.name ?? "");
  const [channel, setChannel] = useState<"EMAIL" | "SMS">((broadcast?.channel as "EMAIL" | "SMS") ?? "EMAIL");
  const [subject, setSubject] = useState(broadcast?.subject ?? "");
  const [fromName, setFromName] = useState(broadcast?.fromName ?? "");
  const [fromEmail, setFromEmail] = useState(broadcast?.fromEmail ?? "");
  const [fromNumber, setFromNumber] = useState(broadcast?.fromNumber ?? "");
  const [bodyHtml, setBodyHtml] = useState(broadcast?.bodyHtml ?? "");
  const [bodyText, setBodyText] = useState(broadcast?.bodyText ?? "");
  const [segmentId, setSegmentId] = useState(broadcast?.segmentId ?? "");
  const [scheduleAt, setScheduleAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const stats = (broadcast?.statsJson ?? null) as Stats;

  function payload() {
    return {
      name,
      channel,
      subject: channel === "EMAIL" ? subject : null,
      fromName: fromName || null,
      fromEmail: channel === "EMAIL" ? fromEmail || null : null,
      fromNumber: channel === "SMS" ? fromNumber || null : null,
      bodyHtml: channel === "EMAIL" ? bodyHtml : null,
      bodyText: bodyText || null,
      segmentId: segmentId || null,
    };
  }

  function save() {
    setError(null);
    setInfo(null);
    start(async () => {
      try {
        if (broadcast) {
          await updateBroadcast(broadcast.id, payload());
          setInfo("Saved.");
          router.refresh();
        } else {
          const id = await createBroadcast(payload());
          router.push(`/app/marketing/broadcasts/${id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save broadcast.");
      }
    });
  }

  function schedule() {
    if (!broadcast) return;
    setError(null);
    setInfo(null);
    start(async () => {
      try {
        await updateBroadcast(broadcast.id, payload());
        const res = await sendBroadcastAction(broadcast.id, scheduleAt || undefined);
        setInfo(`Scheduled to ${res.recipients} recipient(s). ${res.skippedUnsub} skipped (unsubscribed).`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not schedule broadcast.");
      }
    });
  }

  function remove() {
    if (!broadcast) return;
    if (!confirm("Delete this broadcast?")) return;
    start(async () => {
      await deleteBroadcast(broadcast.id);
      router.push("/app/marketing/broadcasts");
    });
  }

  return (
    <div className="p-6">
      <PageHeader
        title={broadcast ? "Broadcast" : "New broadcast"}
        subtitle={locked ? undefined : "Compose and schedule a one-off send."}
        action={
          <div className="flex items-center gap-2">
            {broadcast ? <MarketingBadge value={broadcast.status} /> : null}
            {broadcast ? (
              <button
                onClick={remove}
                disabled={pending}
                className="rounded px-3 py-1.5 text-sm font-medium"
                style={{ color: "var(--kb-error)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
              >
                Delete
              </button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="mb-4 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#d9534f1a", color: "var(--kb-error)" }}>
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="mb-4 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#5cb85c1a", color: "var(--kb-success)" }}>
          {info}
        </div>
      ) : null}

      {locked && stats ? (
        <Card className="mb-4 p-5">
          <div className="grid grid-cols-3 gap-4 text-center sm:grid-cols-6">
            {(["sent", "delivered", "opened", "clicked", "bounced", "failed"] as const).map((k) => (
              <div key={k}>
                <div className="text-xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
                  {stats[k] ?? 0}
                </div>
                <div className="text-xs capitalize" style={{ color: "var(--kb-text-secondary)" }}>
                  {k}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <fieldset disabled={locked || pending} style={{ opacity: locked ? 0.7 : 1 }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Welcome email" />
            </Field>
            <Field label="Channel">
              <select value={channel} onChange={(e) => setChannel(e.target.value as "EMAIL" | "SMS")} style={inputStyle}>
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
              </select>
            </Field>
          </div>

          <Field label="Audience segment">
            <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} style={inputStyle}>
              <option value="">Select a segment</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.entityType})
                </option>
              ))}
            </select>
          </Field>

          {channel === "EMAIL" ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="From name">
                  <input value={fromName} onChange={(e) => setFromName(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="From email">
                  <input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} style={inputStyle} />
                </Field>
              </div>
              <Field label="Subject">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="HTML body">
                <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} style={{ ...inputStyle, minHeight: 160, fontFamily: "monospace" }} />
              </Field>
            </>
          ) : (
            <>
              <Field label="From number (E.164)">
                <input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} style={inputStyle} placeholder="+15551234567" />
              </Field>
              <Field label="Message">
                <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} style={{ ...inputStyle, minHeight: 120 }} />
              </Field>
            </>
          )}
        </fieldset>

        {!locked ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={pending}
              className="rounded px-4 py-2 text-sm font-medium"
              style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              {broadcast ? "Save draft" : "Create draft"}
            </button>
            {broadcast ? (
              <>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  style={{ ...inputStyle, width: "auto" }}
                  title="Leave empty to send on the next cron run"
                />
                <button
                  onClick={schedule}
                  disabled={pending}
                  className="rounded px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
                >
                  {scheduleAt ? "Schedule send" : "Send now"}
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            This broadcast is {broadcast?.status.toLowerCase()} and can no longer be edited.
          </p>
        )}
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "14px",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  backgroundColor: "var(--kb-surface)",
  color: "var(--kb-text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
