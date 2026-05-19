import Link from "next/link";
import { ChevronDown, Pin, X, Search } from "lucide-react";
import type { ReactNode } from "react";

export interface FilterChip {
  label: string;
  active?: boolean;
  onRemove?: string; // URL to navigate to on remove
  count?: number;
}

export interface ViewToggleItem {
  label: string;
  href: string;
  active?: boolean;
}

interface Props {
  title: string;
  pinnable?: boolean;
  createHref?: string;
  createLabel?: string;
  createSplit?: boolean; // show dropdown caret after Create
  filterChips?: FilterChip[];
  searchPlaceholder?: string;
  viewToggles?: ViewToggleItem[];
  // Right-aligned extras (e.g. "Automation rules", "Extensions ▾")
  rightExtras?: ReactNode;
  // Custom children inserted into a second row (e.g. sub-tabs like "Inbound · Planned · More")
  children?: ReactNode;
}

/**
 * Bitrix-style page sub-toolbar that goes BELOW the TopBar.
 * Renders: title + pin + Create button + filter chips + search + view toggles.
 */
export function PageToolbar({
  title,
  pinnable = false,
  createHref,
  createLabel = "Create",
  createSplit = false,
  filterChips = [],
  searchPlaceholder = "search",
  viewToggles = [],
  rightExtras,
  children,
}: Props) {
  return (
    <div className="border-b border-slate-200 bg-white">
      {/* Row 1: title + create + filters + search */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <h1 className="flex items-center gap-1 text-2xl font-bold tracking-tight text-slate-900">
          {title}
          {pinnable && (
            <Pin
              className="h-3.5 w-3.5 cursor-pointer text-slate-400 hover:text-slate-700"
              aria-label="Pin this view"
            />
          )}
        </h1>

        {createHref && (
          <div className="flex">
            <Link
              href={createHref}
              className="inline-flex items-center gap-1.5 rounded-l-md bg-lime-500 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-lime-400"
            >
              <span className="text-base font-bold leading-none">+</span>
              {createLabel}
            </Link>
            {createSplit && (
              <button
                type="button"
                className="rounded-r-md border-l border-lime-600/40 bg-lime-500 px-1.5 text-slate-900 hover:bg-lime-400"
                aria-label="Create options"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {filterChips.map((chip, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
              chip.active
                ? "border-sky-200 bg-sky-50 text-sky-700"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {chip.label}
            {typeof chip.count === "number" && (
              <span className="ml-0.5 text-slate-400">{chip.count}</span>
            )}
            {chip.onRemove && (
              <Link
                href={chip.onRemove}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Remove filter"
              >
                <X className="h-3 w-3" />
              </Link>
            )}
            {!chip.onRemove && <ChevronDown className="h-3 w-3 text-slate-400" />}
          </span>
        ))}

        {/* Inline search */}
        <div className="relative ml-auto md:ml-0 md:flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder={searchPlaceholder}
            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs focus:border-lime-400 focus:outline-none focus:ring-1 focus:ring-lime-400"
          />
        </div>

        {rightExtras && <div className="flex items-center gap-2 ml-auto">{rightExtras}</div>}
      </div>

      {/* Row 2: view toggles + sub-tabs */}
      {(viewToggles.length > 0 || children) && (
        <div className="flex flex-wrap items-center gap-3 px-6 pb-2">
          {viewToggles.length > 0 && (
            <div className="flex items-center gap-1">
              {viewToggles.map((vt) => (
                <Link
                  key={vt.label}
                  href={vt.href}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    vt.active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {vt.label}
                </Link>
              ))}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
