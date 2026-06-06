"use client";

/*
 * Messages page (Sprint 7). Two-pane SMS inbox: left = thread list, right =
 * selected conversation stream + composer. Sending goes through the sendSms
 * server action (Twilio + record). A banner shows when Twilio is unconfigured.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import {
  openThread,
  sendSms,
  type SmsThreadRow,
  type SmsMessageRow,
} from "../sms-actions";

export function MessagesClient({
  threads,
  configured,
}: {
  threads: SmsThreadRow[];
  configured: boolean;
}) {
  const [list, setList] = useState<SmsThreadRow[]>(threads);
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null);
  const [messages, setMessages] = useState<SmsMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const active = list.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    if (!activeId) return;
    setLoading(true);
    openThread(activeId)
      .then((m) => setMessages(m))
      .finally(() => setLoading(false));
    setList((prev) => prev.map((t) => (t.id === activeId ? { ...t, unreadCount: 0 } : t)));
  }, [activeId]);

  function send() {
    const body = draft.trim();
    if (!body || !active) return;
    startTransition(async () => {
      const res = await sendSms({
        fromE164: active.ourNumberE164,
        toE164: active.peerE164,
        body,
        contactId: active.contactId,
        leadId: active.leadId,
      });
      if (res.ok) {
        setDraft("");
        setMessages(await openThread(active.id));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <MessageSquare size={18} style={{ color: "var(--kb-primary)" }} />
        <h1 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Messages</h1>
      </div>

      {!configured ? (
        <div
          className="rounded px-4 py-3 text-sm"
          style={{ backgroundColor: "var(--kb-surface-grey)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}
        >
          Twilio not configured - set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_APP_SID in Vercel env. Existing conversations are shown but new sends will fail.
        </div>
      ) : null}

      <div
        className="flex overflow-hidden rounded"
        style={{ height: "calc(100vh - 220px)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", backgroundColor: "var(--kb-surface)" }}
      >
        <aside className="w-72 shrink-0 overflow-auto" style={{ borderRight: "1px solid var(--kb-border)" }}>
          {list.length === 0 ? (
            <p className="p-4 text-sm" style={{ color: "var(--kb-text-secondary)" }}>No conversations yet.</p>
          ) : (
            <ul>
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className="flex w-full flex-col gap-0.5 px-4 py-3 text-left"
                    style={{
                      borderBottom: "1px solid var(--kb-border)",
                      backgroundColor: t.id === activeId ? "var(--kb-surface-grey)" : "transparent",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>
                        {t.peerName || t.peerE164}
                      </span>
                      {t.unreadCount > 0 ? (
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: "var(--kb-primary)" }}>
                          {t.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <span className="truncate text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>
                      {t.peerName ? t.peerE164 : ""}{t.lastMessageAt ? ` - ${new Date(t.lastMessageAt).toLocaleDateString()}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {!active ? (
            <div className="grid flex-1 place-items-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              Select a conversation.
            </div>
          ) : (
            <>
              <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--kb-border)" }}>
                <p className="text-sm" style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>{active.peerName || active.peerE164}</p>
                <p className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{active.peerE164} via {active.ourNumberE164}</p>
              </header>
              <div className="flex-1 overflow-auto px-5 py-4">
                {loading ? (
                  <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading...</p>
                ) : (
                  <ul className="space-y-2">
                    {messages.map((m) => {
                      const outbound = m.direction === "OUTBOUND";
                      return (
                        <li key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                          <div
                            className="max-w-[70%] rounded px-3 py-2 text-sm"
                            style={{
                              backgroundColor: outbound ? "var(--kb-primary)" : "var(--kb-surface-grey)",
                              color: outbound ? "#fff" : "var(--kb-text-primary)",
                              borderRadius: "var(--kb-radius-sm)",
                            }}
                          >
                            <p className="whitespace-pre-wrap">{m.body}</p>
                            <div className="mt-1 text-[10px]" style={{ opacity: 0.7 }}>
                              {m.sentAt ? new Date(m.sentAt).toLocaleString() : new Date(m.createdAt).toLocaleString()}
                              {m.status === "FAILED" ? " (failed)" : ""}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--kb-border)" }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message"
                  rows={1}
                  className="flex-1 resize-none rounded px-3 py-2 text-sm outline-none"
                  style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={pending || !draft.trim()}
                  className="rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
                >
                  {pending ? "Sending..." : "Send"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
