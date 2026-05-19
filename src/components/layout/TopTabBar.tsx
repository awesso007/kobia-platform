"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { TopTab } from "@/lib/modules-config";

export function TopTabBar({
  tenantSlug,
  tabs,
}: {
  tenantSlug: string;
  tabs: TopTab[];
}) {
  const pathname = usePathname();
  const base = `/${tenantSlug}`;
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenIdx(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function isTabActive(tab: TopTab): boolean {
    if (tab.href) {
      const full = `${base}${tab.href}`;
      return pathname === full || pathname.startsWith(`${full}/`);
    }
    if (tab.groups) {
      for (const g of tab.groups) {
        for (const item of g.items) {
          const full = `${base}${item.href}`;
          if (pathname === full || pathname.startsWith(`${full}/`)) return true;
        }
      }
    }
    return false;
  }

  return (
    <nav
      ref={containerRef}
      className="flex items-center gap-0.5 overflow-x-auto"
      aria-label="Module tabs"
    >
      {tabs.map((tab, idx) => {
        const active = isTabActive(tab);
        const isOpen = openIdx === idx;

        // Leaf tab — direct link
        if (tab.href && !tab.groups) {
          const href = `${base}${tab.href}`;
          return (
            <Link
              key={tab.label}
              href={href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition whitespace-nowrap ${
                active
                  ? "bg-slate-700/80 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        }

        // Dropdown tab
        return (
          <div key={tab.label} className="relative">
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              onMouseEnter={() => {
                // open on hover if no dropdown is locked open
                if (openIdx !== null) setOpenIdx(idx);
              }}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition whitespace-nowrap ${
                active || isOpen
                  ? "bg-slate-700/80 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
            >
              {tab.label}
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`}
                strokeWidth={2.5}
              />
            </button>

            {isOpen && tab.groups && (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-md border border-slate-200 bg-white py-1 shadow-xl"
                onMouseLeave={() => setOpenIdx(null)}
              >
                {tab.groups.map((group, gi) => (
                  <div key={gi}>
                    {group.label && (
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {group.label}
                      </div>
                    )}
                    {group.items.map((item) => {
                      const href = `${base}${item.href}`;
                      const itemActive =
                        pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setOpenIdx(null)}
                          className={`flex items-center justify-between gap-3 px-3 py-1.5 text-sm transition ${
                            itemActive
                              ? "bg-lime-50 text-slate-900"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                          role="menuitem"
                        >
                          <span className="flex items-center gap-2">
                            {item.icon && (
                              <item.icon className="h-4 w-4 text-slate-400" />
                            )}
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    {gi < tab.groups!.length - 1 && (
                      <div className="my-1 border-t border-slate-100" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* More overflow indicator — placeholder for future */}
      <div className="hidden lg:flex">
        <button
          type="button"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
