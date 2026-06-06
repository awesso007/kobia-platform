"use client";

/*
 * Shared client primitives for the Marketing module (Sprint 13). Plain Tailwind
 * plus .kobia-crm token styles, matching the rest of the CRM surfaces.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: "var(--kb-surface)",
        border: "1px solid var(--kb-border)",
        borderRadius: "var(--kb-radius)",
      }}
    >
      {children}
    </div>
  );
}

const BADGE_COLORS: Record<string, string> = {
  DRAFT: "#828282",
  SCHEDULED: "#1d77bd",
  SENDING: "#2fc6f6",
  SENT: "#5cb85c",
  FAILED: "#d9534f",
  ACTIVE: "#5cb85c",
  PAUSED: "#f0ad4e",
  ARCHIVED: "#828282",
  PUBLISHED: "#5cb85c",
  EMAIL: "#1d77bd",
  SMS: "#7d4aea",
};

export function MarketingBadge({ value }: { value: string }) {
  const color = BADGE_COLORS[value] ?? "#828282";
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}1a`, color, borderRadius: "var(--kb-radius-sm)" }}
    >
      {value}
    </span>
  );
}

export function EmptyState({ message, cta }: { message: string; cta?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        {message}
      </p>
      {cta ? <div className="mt-4 flex justify-center">{cta}</div> : null}
    </div>
  );
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium hover:underline" style={{ color: "var(--kb-primary)" }}>
      {children}
    </Link>
  );
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
