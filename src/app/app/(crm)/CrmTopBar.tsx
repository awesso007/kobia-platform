"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Menu, MessageSquare, Search } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { TenantSwitcher } from "./TenantSwitcher";
import { EmailComposer } from "@/components/crm/email/EmailComposer";
import { CommandPalette } from "@/components/crm/search/CommandPalette";
import type { NotificationRow } from "@/lib/notifications/queries";
import type { UserTenant } from "@/lib/tenancy/user-tenants";

/*
 * CRM top bar. Bitrix24 pattern: 56px tall, light surface, left = tenant
 * switcher, center = search, right = compose-email + notifications bell + user
 * menu.
 */
export function CrmTopBar({ notifications = [], tenants = [] }: { notifications?: NotificationRow[]; tenants?: UserTenant[] }) {
  const [composing, setComposing] = useState(false);
  return (
    <header
      className="flex items-center gap-2 px-3 md:gap-4 md:px-4"
      style={{
        height: "var(--kb-topbar-h)",
        backgroundColor: "var(--kb-surface)",
        borderBottom: "1px solid var(--kb-border)",
      }}
    >
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("kobia:toggle-nav"))}
        className="grid place-items-center rounded md:hidden"
        style={{ width: 44, height: 44, color: "var(--kb-text-secondary)" }}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <div className="hidden md:block">
        <TenantSwitcher tenants={tenants} />
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("kobia:open-search"))}
        className="relative flex flex-1 max-w-xl items-center gap-2 rounded py-1.5 pl-9 pr-3 text-sm"
        style={{
          backgroundColor: "var(--kb-surface-grey)",
          border: "1px solid var(--kb-border)",
          borderRadius: "var(--kb-radius-sm)",
          color: "var(--kb-text-secondary)",
        }}
      >
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <span className="flex-1 text-left">Search</span>
        <kbd
          className="hidden rounded px-1.5 py-0.5 text-[10px] sm:block"
          style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)" }}
        >
          Cmd K
        </kbd>
      </button>

      <Link
        href="/app/messages"
        aria-label="Messages"
        className="grid h-8 w-8 place-items-center rounded"
        style={{ color: "var(--kb-text-secondary)" }}
      >
        <MessageSquare size={18} />
      </Link>

      <button
        type="button"
        onClick={() => setComposing(true)}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white"
        style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
      >
        <Mail size={14} /> <span className="hidden sm:inline">Email</span>
      </button>

      <NotificationBell initial={notifications} />

      <div
        className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: "var(--kb-accent-purple)" }}
        aria-label="User menu"
      >
        U
      </div>

      {composing ? <EmailComposer context={{}} onClose={() => setComposing(false)} onSent={() => setComposing(false)} /> : null}
      <CommandPalette />
    </header>
  );
}
