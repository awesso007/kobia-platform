"use client";

import { Search, Bell, ChevronDown } from "lucide-react";

/*
 * CRM top bar. Bitrix24 pattern: 56px tall, light surface, left = tenant
 * switcher, center = search, right = notifications bell + user menu.
 *
 * Sprint 1: tenant switcher and user menu are stubs. Final wiring depends on
 * the tenant-resolution decision (see CONFLICTS.md, Conflict 2). The Clerk
 * <UserButton> is intentionally not added here yet to avoid touching Clerk
 * wiring before that decision.
 */
export function CrmTopBar() {
  return (
    <header
      className="flex items-center gap-4 px-4"
      style={{
        height: "var(--kb-topbar-h)",
        backgroundColor: "var(--kb-surface)",
        borderBottom: "1px solid var(--kb-border)",
      }}
    >
      <button
        type="button"
        className="flex items-center gap-2 rounded px-2 py-1 text-sm"
        style={{ color: "var(--kb-text-primary)" }}
      >
        <span
          className="grid h-6 w-6 place-items-center rounded text-xs font-semibold text-white"
          style={{ backgroundColor: "var(--kb-primary)" }}
        >
          A
        </span>
        <span>Select tenant</span>
        <ChevronDown size={14} style={{ color: "var(--kb-text-secondary)" }} />
      </button>

      <div className="relative flex-1 max-w-xl">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--kb-text-secondary)" }}
        />
        <input
          type="search"
          placeholder="Search"
          className="w-full rounded py-1.5 pl-9 pr-3 text-sm outline-none"
          style={{
            backgroundColor: "var(--kb-surface-grey)",
            border: "1px solid var(--kb-border)",
            borderRadius: "var(--kb-radius-sm)",
          }}
        />
      </div>

      <button
        type="button"
        className="relative grid h-9 w-9 place-items-center rounded"
        aria-label="Notifications"
        style={{ color: "var(--kb-text-secondary)" }}
      >
        <Bell size={18} />
        <span
          className="absolute right-2 top-2 h-2 w-2 rounded-full"
          style={{ backgroundColor: "var(--kb-success)" }}
        />
      </button>

      <div
        className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: "var(--kb-accent-purple)" }}
        aria-label="User menu"
      >
        U
      </div>
    </header>
  );
}
