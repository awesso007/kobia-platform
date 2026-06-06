"use client";

/*
 * RecordPane - reusable 480px right-side slide-in panel for a single CRM
 * record. Three tabs: Details, Activity, Notes. Activity/Notes read CrmActivity
 * rows for the record (filtered by type + id) and the composer at the bottom
 * appends new activities. Mount under any record route via:
 *   <RecordPane type="lead|deal|contact|company" id={id} title=... details={...} />
 *
 * Styling uses the .kobia-crm design tokens (the CRM shell sets that class on
 * its root, so token vars resolve here).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import type { ActivityKind, ActivityRow, RecordType } from "@/lib/crm/record";
import { ACTIVITY_TYPES } from "@/lib/crm/record";
import { addActivity, listActivities } from "@/app/app/(crm)/activity-actions";
import { countUnreadForRecord } from "@/app/app/(crm)/email-actions";
import { countUnreadForRecord as countUnreadSmsForRecord } from "@/app/app/(crm)/sms-actions";
import { EmailTab } from "@/components/crm/email/EmailTab";
import { SmsTab } from "@/components/crm/sms/SmsTab";
import { FilesTab } from "@/components/crm/files/FilesTab";
import { CallButton } from "@/components/crm/calls/CallButton";

type Tab = "details" | "activity" | "email" | "sms" | "files" | "notes";

const TABS: Tab[] = ["details", "activity", "email", "sms", "files", "notes"];

export function RecordPane({
  type,
  id,
  title,
  subtitle,
  details,
  vars,
  recordPhone,
  initialTab = "details",
  onClose,
}: {
  type: RecordType;
  id: string;
  title: string;
  subtitle?: string;
  details?: React.ReactNode;
  vars?: Record<string, string>;
  recordPhone?: string | null;
  initialTab?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [unread, setUnread] = useState(false);
  const [smsUnread, setSmsUnread] = useState(false);

  useEffect(() => {
    let active = true;
    countUnreadForRecord(type, id).then((n) => { if (active) setUnread(n > 0); }).catch(() => {});
    countUnreadSmsForRecord(type, id).then((n) => { if (active) setSmsUnread(n > 0); }).catch(() => {});
    return () => { active = false; };
  }, [type, id]);

  // The global keyboard handler dispatches kobia:escape on Esc; close on it.
  useEffect(() => {
    const onEscape = () => onClose();
    window.addEventListener("kobia:escape", onEscape);
    return () => window.removeEventListener("kobia:escape", onEscape);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.25)" }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-0 z-50 flex h-full w-full flex-col md:inset-y-0 md:right-0 md:left-auto md:w-[480px]"
        style={{
          maxWidth: "100vw",
          backgroundColor: "var(--kb-surface)",
          boxShadow: "var(--kb-shadow-modal)",
        }}
        role="dialog"
        aria-label={`${title} details`}
      >
        <header
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--kb-border)" }}
        >
          <div className="min-w-0">
            <h2
              className="truncate"
              style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="truncate text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {recordPhone && (type === "contact" || type === "lead") ? (
              <CallButton
                target={{
                  toE164: recordPhone,
                  contactId: type === "contact" ? id : undefined,
                  leadId: type === "lead" ? id : undefined,
                }}
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded"
              style={{ color: "var(--kb-text-secondary)" }}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto px-3 pt-2" style={{ borderBottom: "1px solid var(--kb-border)" }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="flex shrink-0 items-center gap-1 px-3 py-2 text-sm capitalize"
              style={{
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? "var(--kb-primary)" : "var(--kb-text-secondary)",
                borderBottom: tab === t ? "2px solid var(--kb-primary)" : "2px solid transparent",
              }}
            >
              {t}
              {(t === "email" && unread) || (t === "sms" && smsUnread) ? (
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--kb-primary)" }} />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-auto">
          {tab === "details" ? (
            <div className="p-5">{details ?? <EmptyNote text="No details to show." />}</div>
          ) : tab === "email" ? (
            <EmailTab type={type} id={id} vars={vars} />
          ) : tab === "sms" ? (
            <SmsTab type={type} id={id} recordPhone={recordPhone} />
          ) : tab === "files" ? (
            <FilesTab type={type} id={id} />
          ) : (
            <ActivityFeed key={tab} type={type} id={id} notesOnly={tab === "notes"} />
          )}
        </div>
      </aside>
    </>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
      {text}
    </p>
  );
}

function ActivityFeed({ type, id, notesOnly }: { type: RecordType; id: string; notesOnly: boolean }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<ActivityKind>(notesOnly ? "NOTE" : "CALL");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    setLoading(true);
    listActivities(type, id, { notesOnly })
      .then((data) => {
        if (active) setRows(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [type, id, notesOnly]);

  function submit() {
    const trimmed = subject.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const created = await addActivity({
        type,
        id,
        kind: notesOnly ? "NOTE" : kind,
        subject: trimmed,
        body: body.trim() || undefined,
      });
      setRows((prev) => [created, ...prev]);
      setSubject("");
      setBody("");
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto px-5 py-4">
        {loading ? (
          <EmptyNote text="Loading..." />
        ) : rows.length === 0 ? (
          <EmptyNote text={notesOnly ? "No notes yet." : "No activity yet."} />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded p-3"
                style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium uppercase"
                    style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}
                  >
                    {r.type}
                  </span>
                  <time className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>
                    {new Date(r.occurredAt).toLocaleString()}
                  </time>
                </div>
                <p className="mt-1 text-sm" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>
                  {r.subject}
                </p>
                {r.body ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                    {r.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-4" style={{ borderTop: "1px solid var(--kb-border)" }}>
        {!notesOnly ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {ACTIVITY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setKind(t)}
                className="rounded px-2 py-1 text-xs"
                style={{
                  border: "1px solid var(--kb-border)",
                  borderRadius: "var(--kb-radius-sm)",
                  backgroundColor: kind === t ? "var(--kb-primary)" : "var(--kb-surface)",
                  color: kind === t ? "#fff" : "var(--kb-text-secondary)",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={notesOnly ? "Add a note title" : "Add an activity subject"}
          className="mb-2 w-full rounded px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details (optional)"
          rows={2}
          className="mb-2 w-full resize-none rounded px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !subject.trim()}
          className="rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          {pending ? "Adding..." : notesOnly ? "Add note" : "Add activity"}
        </button>
      </div>
    </div>
  );
}
