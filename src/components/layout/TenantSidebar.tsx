import Link from "next/link";
import type { Tenant } from "@prisma/client";
import { BookOpen, DollarSign, FileText, Home, Receipt, Settings } from "lucide-react";

export function TenantSidebar({ tenant }: { tenant: Tenant }) {
  const base = `/${tenant.slug}`;
  const items = [
    { href: `${base}/dashboard`, label: "Dashboard", icon: Home },
    { href: `${base}/books`, label: "Books", icon: BookOpen },
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
