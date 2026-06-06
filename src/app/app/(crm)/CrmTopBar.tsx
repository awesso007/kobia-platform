"use client";

import { Search } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { TenantSwitcher } from "./TenantSwitcher";
import type { NotificationRow } from "@/lib/notifications/queries";
import type { UserTenant } from "@/lib/tenancy/user-tenants";

/*
 * CRM top bar. Bitrix24 pattern: 56px tall, light surface, left = tenant
 * switcher, center = search, right = notifications bell + user menu.
 */
export function CrmTopBar({ notifications = [], tenants = [] }: { notifications?: NotificationRow[]; tenants?: UserTenant[] }) {
  return (
    <header
      className="flex items-center gap-4 px-4"
      style={{
        height: "var(--kb-topbar-h)",
        backgroundColor: "var(--kb-surface)",
        borderBottom: "1px solid var(--kb-border)",
      }}
    >
      <TenantSwitcher tenants={tenants} />

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

      <NotificationBell initial={notifications} />

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
