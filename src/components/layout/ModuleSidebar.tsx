"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { SIDEBAR_SECTIONS } from "@/lib/sidebar-nav";

export function ModuleSidebar({
  tenantSlug,
  activeModule: _activeModule,
}: {
  tenantSlug: string;
  // kept for compatibility with TenantLayout — not currently used in flat sidebar
  activeModule?: string;
}) {
  const pathname = usePathname();
  const base = `/${tenantSlug}`;

  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white"
      aria-label="Navigation"
    >
      {/* Logo */}
      <Link
        href={`${base}/dashboard`}
        className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 hover:bg-slate-50"
        title="Dashboard"
      >
        <div className="flex h-8 items-center rounded-md bg-slate-900 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-64.png" alt="KOBIA" className="h-5 w-auto" />
        </div>
      </Link>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-3">
        {SIDEBAR_SECTIONS.map((section, sIdx) => (
          <div key={sIdx} className={sIdx > 0 ? "mt-4" : ""}>
            {section.label ? (
              <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {section.label}
              </p>
            ) : null}
            <ul>
              {section.items.map((item) => {
                const href = `${base}${item.href}`;
                const isActive =
                  pathname === href || pathname.startsWith(`${href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={href}
                      className={`flex items-center gap-3 px-4 py-2 text-sm transition ${
                        isActive
                          ? "bg-[color:var(--kobia-primary-50,#eff6ff)] font-semibold text-[color:var(--kobia-primary,#0F172A)]"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive
                            ? "text-[color:var(--kobia-primary,#0F172A)]"
                            : "text-slate-500"
                        }`}
                        strokeWidth={2}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Upgrade pill */}
      <div className="border-t border-slate-100 p-3">
        <Link
          href={`${base}/settings/billing`}
          className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-orange-400 hover:to-pink-400"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Upgrade your plan
        </Link>
      </div>
    </aside>
  );
}
