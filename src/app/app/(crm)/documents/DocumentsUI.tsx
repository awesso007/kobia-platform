"use client";

/*
 * Shared client primitives for the Documents module (Sprint 14). Plain Tailwind
 * plus .kobia-crm token styles, matching the rest of the CRM surfaces.
 *
 * IMPORTANT: only React components live here. Pure utility functions (fmtDate,
 * formatBytes, pathCrumbs) live in documents-utils.ts WITHOUT "use client" so
 * server components can import them safely. See the header of documents-utils.ts.
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
  SENT: "#1d77bd",
  VIEWED: "#2fc6f6",
  SIGNED: "#5cb85c",
  COMPLETED: "#5cb85c",
  VOIDED: "#828282",
  DECLINED: "#d9534f",
  PENDING: "#f0ad4e",
  FILE: "#1d77bd",
  DOC: "#7d4aea",
};

export function DocBadge({ value }: { value: string }) {
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

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      style={{
        border: "1px solid var(--kb-border)",
        color: "var(--kb-text-primary)",
        borderRadius: "var(--kb-radius-sm)",
      }}
    >
      {children}
    </button>
  );
}
