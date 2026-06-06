"use client";

/*
 * Small CRM UI primitives built on the .kobia-crm design tokens. Plain Tailwind
 * plus inline token styles (the repo has no shadcn button/badge primitives).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { cn } from "@/lib/utils";

export function KbButton({
  children,
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  const base = "inline-flex items-center gap-1.5 rounded text-sm font-medium disabled:opacity-50";
  const style: React.CSSProperties = {
    padding: "var(--kb-btn-pad-y) var(--kb-btn-pad-x)",
    borderRadius: "var(--kb-radius-sm)",
  };
  if (variant === "primary") {
    style.backgroundColor = "var(--kb-primary)";
    style.color = "#fff";
  } else if (variant === "outline") {
    style.border = "1px solid var(--kb-border)";
    style.color = "var(--kb-text-primary)";
    style.backgroundColor = "var(--kb-surface)";
  } else {
    style.color = "var(--kb-text-secondary)";
  }
  return (
    <button className={cn(base, className)} style={style} {...rest}>
      {children}
    </button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  NEW: "#1d77bd",
  CONTACTED: "#7d4aea",
  QUALIFIED: "#5cb85c",
  UNQUALIFIED: "#828282",
  CONVERTED: "#2fc6f6",
  OPEN: "#1d77bd",
  WON: "#5cb85c",
  LOST: "#d9534f",
};

export function StatusBadge({ value }: { value: string }) {
  const color = STATUS_COLORS[value] ?? "#828282";
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}1a`, color, borderRadius: "var(--kb-radius-sm)" }}
    >
      {value}
    </span>
  );
}
