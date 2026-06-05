"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { crmNav } from "./crm-nav";

/*
 * CRM left rail. Bitrix24 pattern: dark navy sidebar, icon + label, active item
 * highlighted with a subtle tint. Collapses to 64px (icons only), expands to
 * 240px. Tokens come from src/styles/tokens.css (.kobia-crm scope).
 */
export function CrmSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col text-[13px]"
      style={{
        width: collapsed ? "var(--kb-sidebar-w-collapsed)" : "var(--kb-sidebar-w)",
        backgroundColor: "var(--kb-sidebar-bg)",
        color: "var(--kb-sidebar-text)",
        transition: "width 150ms ease",
      }}
    >
      <div
        className="flex items-center px-4"
        style={{ height: "var(--kb-topbar-h)" }}
      >
        {!collapsed && (
          <span
            className="font-semibold tracking-wide"
            style={{ color: "var(--kb-sidebar-text-active)", fontSize: "16px" }}
          >
            KOBIA
          </span>
        )}
      </div>

      <nav className="flex-1 px-2 py-2">
        {crmNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              title={item.label}
              className={cn(
                "mb-1 flex items-center gap-3 rounded px-3 py-2",
                collapsed && "justify-center px-0",
              )}
              style={{
                backgroundColor: active ? "var(--kb-sidebar-active)" : "transparent",
                color: active
                  ? "var(--kb-sidebar-text-active)"
                  : "var(--kb-sidebar-text)",
                borderRadius: "var(--kb-radius-sm)",
                fontWeight: active ? 500 : 400,
              }}
            >
              <Icon size={18} strokeWidth={1.75} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          collapsed && "justify-center px-0",
        )}
        style={{ color: "var(--kb-sidebar-text)" }}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
