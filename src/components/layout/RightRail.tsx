"use client";

import { Bell, Sparkles, Search, Bookmark, MessageSquare } from "lucide-react";

const ITEMS = [
  { key: "notifications", label: "Notifications", icon: Bell, badge: 0 },
  { key: "ai", label: "KOBIA Copilot", icon: Sparkles },
  { key: "search", label: "Quick search", icon: Search },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "bookmarks", label: "Saved", icon: Bookmark },
];

export function RightRail() {
  return (
    <aside
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-slate-800 bg-slate-900 py-3"
      aria-label="Quick tools"
    >
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          title={item.label}
          className="group relative flex h-9 w-9 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <item.icon className="h-4 w-4" strokeWidth={2.25} />
          {/* Tooltip */}
          <span
            className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover:opacity-100 z-50"
            role="tooltip"
          >
            {item.label}
          </span>
        </button>
      ))}
    </aside>
  );
}
