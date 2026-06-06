"use client";

/*
 * Top-bar notification bell + dropdown panel (Sprint 5). Shows an unread count
 * badge; clicking opens a 400px panel with Unread / All tabs. A row click marks
 * the notification read and navigates to its linkUrl. "Mark all read" clears the
 * badge. State is seeded server-side and mutated optimistically via actions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, AtSign, UserCheck, Clock, Zap, Info } from "lucide-react";
import { markNotificationRead, markAllNotificationsRead } from "./notifications-actions";
import type { NotificationRow } from "@/lib/notifications/queries";

type NotificationType = NotificationRow["type"];

const ICON: Record<NotificationType, typeof Bell> = {
  MENTION: AtSign,
  ASSIGNMENT: UserCheck,
  DUE_SOON: Clock,
  AUTOMATION_RESULT: Zap,
  SYSTEM: Info,
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell({ initial }: { initial: NotificationRow[] }) {
  const [items, setItems] = useState<NotificationRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.readAt);
  const visible = tab === "unread" ? unread : items;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function openRow(n: NotificationRow) {
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      start(() => {
        void markNotificationRead(n.id);
      });
    }
    if (n.linkUrl) window.location.href = n.linkUrl;
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: now })));
    start(() => {
      void markAllNotificationsRead();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded"
        aria-label="Notifications"
        style={{ color: "var(--kb-text-secondary)" }}
      >
        <Bell size={18} />
        {unread.length > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: "var(--kb-error)", height: "16px" }}
          >
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 overflow-hidden rounded"
          style={{
            width: "400px",
            backgroundColor: "var(--kb-surface)",
            border: "1px solid var(--kb-border)",
            borderRadius: "var(--kb-radius)",
            boxShadow: "var(--kb-shadow-modal)",
          }}
        >
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--kb-border)" }}>
            <div className="flex gap-1">
              {(["unread", "all"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className="rounded px-2 py-1 text-sm capitalize"
                  style={{
                    backgroundColor: tab === t ? "var(--kb-surface-grey)" : "transparent",
                    color: tab === t ? "var(--kb-text-primary)" : "var(--kb-text-secondary)",
                    fontWeight: tab === t ? 600 : 400,
                  }}
                >
                  {t}
                  {t === "unread" && unread.length > 0 ? ` (${unread.length})` : ""}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={markAll}
              disabled={unread.length === 0}
              className="text-xs"
              style={{ color: unread.length === 0 ? "var(--kb-text-secondary)" : "var(--kb-primary)" }}
            >
              Mark all read
            </button>
          </div>

          <div style={{ maxHeight: "420px", overflowY: "auto" }}>
            {visible.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                {tab === "unread" ? "No unread notifications" : "No notifications yet"}
              </div>
            ) : (
              visible.map((n) => {
                const Icon = ICON[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openRow(n)}
                    className="flex w-full gap-3 px-3 py-2.5 text-left"
                    style={{
                      borderBottom: "1px solid var(--kb-border)",
                      backgroundColor: n.readAt ? "transparent" : "var(--kb-surface-grey)",
                    }}
                  >
                    <Icon size={16} style={{ color: "var(--kb-primary)", marginTop: "2px", flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm" style={{ fontWeight: n.readAt ? 400 : 600, color: "var(--kb-text-primary)" }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                          {n.body}
                        </div>
                      )}
                      <div className="mt-0.5 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                        {relativeTime(n.createdAt)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
