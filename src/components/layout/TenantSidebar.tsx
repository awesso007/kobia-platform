import Link from "next/link";
import type { Tenant } from "@prisma/client";
import { BookOpen, DollarSign, FileText, Home, Receipt, Settings, BarChart3 } from "lucide-react";
import { EntitySwitcher } from "./EntitySwitcher";

type SwitcherEntity = {
  id: string;
  name: string;
  industry: string | null;
  baseCurrency: string | null;
};

export function TenantSidebar({
  tenant,
  entities,
  activeEntityId,
}: {
  tenant: Tenant;
  entities: SwitcherEntity[];
  activeEntityId: string | null;
}) {
  const base = `/${tenant.slug}`;
  const items = [
    { href: `${base}/dashboard`, label: "Dashboard", icon: Home },
    { href: `${base}/books`, label: "Books", icon: BookOpen },
    { href: `${base}/books/reports/pnl`, label: "P&L", icon: BarChart3 },
    { href: `${base}/books/reports/balance-sheet`, label: "Balance Sheet", icon: BarChart3 },
    { href: `${base}/books/reports/ar-aging`, label: "AR Aging", icon: BarChart3 },
    { href: `${base}/payroll`, label: "Payroll", icon: DollarSign },
    { href: `${base}/invoicing`, label: "Invoicing", icon: FileText },
    { href: `${base}/bills`, label: "Bill Pay", icon: Receipt },
    { href: `${base}/settings`, label: "Settings", icon: Settings },
  ];

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-6">
        {tenant.logoUrl ? (
          <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-auto" />
        ) : (
          <div className="text-lg font-semibold">{tenant.name}</div>
        )}
      </div>

      {entities.length > 0 && activeEntityId && (
        <div className="border-b border-border p-3">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Active Entity
          </p>
          <EntitySwitcher
            tenantSlug={tenant.slug}
            entities={entities}
            activeEntityId={activeEntityId}
          />
        </div>
      )}

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
