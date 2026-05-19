import Link from "next/link";
import { getModuleByKey } from "@/lib/modules-config";
import type { ModuleKey } from "@/lib/active-module";

export function TenantSidebar({
  tenantSlug,
  activeModule,
}: {
  tenantSlug: string;
  activeModule: ModuleKey;
}) {
  const base = `/${tenantSlug}`;
  const mod = getModuleByKey(activeModule);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      {/* Module title header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <mod.icon className="h-4 w-4 text-lime-600" strokeWidth={2.5} />
        <span className="text-sm font-semibold text-foreground">{mod.label}</span>
      </div>

      {/* Contextual nav groups */}
      <nav className="flex-1 overflow-y-auto p-3">
        {mod.groups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const href = `${base}${item.href}`;
                const isLocked = !!item.badge;
                return (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition hover:bg-muted"
                  >
                    <span className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4 text-slate-500" />
                      {item.label}
                    </span>
                    {isLocked && (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
