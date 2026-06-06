"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { crmNav } from "./crm-nav";

/*
 * CRM left rail. Bitrix24 pattern: dark navy sidebar, icon + label, active item
 * highlighted with a subtle tint. Collapses to 64px (icons only), expands to
 * 240px. Tokens come from src/styles/tokens.css (.kobia-crm scope).
 *
 * Responsive (Sprint 9): below the md breakpoint (768px) the rail is hidden and
 * instead slides in as a 280px drawer over a scrim. The top bar's hamburger
 * dispatches "kobia:toggle-nav" to open it; navigating or tapping the scrim
 * closes it. The collapse control only applies to the desktop rail.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export function CrmSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setDrawerOpen((o) => !o);
    const onEscape = () => setDrawerOpen(false);
    window.addEventListener("kobia:toggle-nav", onToggle);
    window.addEventListener("kobia:escape", onEscape);
    return () => {
      window.removeEventListener("kobia:toggle-nav", onToggle);
      window.removeEventListener("kobia:escape", onEscape);
    };
  }, []);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop rail: hidden below md, where the drawer takes over. */}
      <aside
        className="hidden flex-col text-[13px] md:flex"
        style={{
          width: collapsed ? "var(--kb-sidebar-w-collapsed)" : "var(--kb-sidebar-w)",
          backgroundColor: "var(--kb-sidebar-bg)",
          color: "var(--kb-sidebar-text)",
          transition: "width 150ms ease",
        }}
      >
        <div className="flex items-center px-4" style={{ height: "var(--kb-topbar-h)" }}>
          {!collapsed && (
            <span
              className="font-semibold tracking-wide"
              style={{ color: "var(--kb-sidebar-text-active)", fontSize: "16px" }}
            >
              KOBIA
            </span>
          )}
        </div>

        <NavItems pathname={pathname} collapsed={collapsed} />

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn("flex items-center gap-3 px-4 py-3", collapsed && "justify-center px-0")}
          style={{ color: "var(--kb-sidebar-text)" }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      {/* Mobile drawer + scrim: only mounted below md. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 flex h-full flex-col text-[13px]"
            style={{
              width: "280px",
              backgroundColor: "var(--kb-sidebar-bg)",
              color: "var(--kb-sidebar-text)",
            }}
          >
            <div className="flex items-center justify-between px-4" style={{ height: "var(--kb-topbar-h)" }}>
              <span
                className="font-semibold tracking-wide"
                style={{ color: "var(--kb-sidebar-text-active)", fontSize: "16px" }}
              >
                KOBIA
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid place-items-center"
                style={{ width: 44, height: 44, color: "var(--kb-sidebar-text)" }}
                aria-label="Close navigation"
              >
                <X size={20} />
              </button>
            </div>
            <NavItems pathname={pathname} collapsed={false} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function NavItems({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  return (
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
              color: active ? "var(--kb-sidebar-text-active)" : "var(--kb-sidebar-text)",
              borderRadius: "var(--kb-radius-sm)",
              fontWeight: active ? 500 : 400,
              minHeight: 44,
            }}
          >
            <Icon size={18} strokeWidth={1.75} />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
