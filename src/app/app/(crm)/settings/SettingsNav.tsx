"use client";

/*
 * Settings sub-navigation tabs. Sits above each settings surface (custom fields,
 * tags, audit). Active tab derived from the current pathname.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/settings/custom-fields", label: "Custom fields" },
  { href: "/app/settings/tags", label: "Tags" },
  { href: "/app/settings/audit", label: "Audit log" },
  { href: "/app/settings/team", label: "Team" },
  { href: "/app/settings/billing", label: "Billing" },
  { href: "/app/settings/notifications", label: "Notifications" },
  { href: "/app/settings/forms", label: "Forms" },
  { href: "/app/settings/workspace", label: "Workspace" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex gap-1" style={{ borderBottom: "1px solid var(--kb-border)" }}>
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-3 py-2 text-sm"
            style={{
              color: active ? "var(--kb-primary)" : "var(--kb-text-secondary)",
              fontWeight: active ? 600 : 400,
              borderBottom: active ? "2px solid var(--kb-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
