"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";

export interface FeatureHeroBullet {
  text: string;
}

interface Props {
  /** Page title shown above the hero card, e.g. "Sign and manage" */
  pageTitle: string;
  /** Primary header action shown next to the title, e.g. { label: "+ Sign", onClick } */
  headerAction?: { label: string; onClick?: () => void; href?: string };
  /** Eyebrow / product line, e.g. "KOBIA Sign" */
  eyebrow: string;
  /** Tagline beneath eyebrow, e.g. "Free. Efficient. Paperless." */
  tagline: string;
  /** Bullet list with green checks */
  bullets: FeatureHeroBullet[];
  /** Primary CTA (lime) */
  primaryCta: { label: string; onClick?: () => void; href?: string };
  /** Secondary CTA (sky text link) */
  secondaryCta?: { label: string; onClick?: () => void; href?: string };
  /** Right-side artwork — pass an <Image/> or any node. Falls back to a stylized placeholder. */
  artwork?: ReactNode;
}

/**
 * Bitrix24-style "Sign and manage" hero — used as the entry/landing page
 * for any KOBIA feature module before the user has data.
 */
export function FeatureHero({
  pageTitle,
  headerAction,
  eyebrow,
  tagline,
  bullets,
  primaryCta,
  secondaryCta,
  artwork,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Page header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{pageTitle}</h1>
        {headerAction &&
          (headerAction.href ? (
            <a
              href={headerAction.href}
              className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              {headerAction.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={headerAction.onClick}
              className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
            >
              {headerAction.label}
            </button>
          ))}
      </div>

      {/* Hero card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-8 px-8 py-10 md:grid-cols-[1.2fr_1fr] md:items-center">
          {/* Left: copy */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              {tagline}
            </h2>

            <ul className="mt-6 space-y-3">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span>{b.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {primaryCta.href ? (
                <a
                  href={primaryCta.href}
                  className="rounded-md bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-lime-300"
                >
                  {primaryCta.label}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={primaryCta.onClick}
                  className="rounded-md bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-lime-300"
                >
                  {primaryCta.label}
                </button>
              )}

              {secondaryCta &&
                (secondaryCta.href ? (
                  <a
                    href={secondaryCta.href}
                    className="rounded-md px-3 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 hover:text-sky-700"
                  >
                    {secondaryCta.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={secondaryCta.onClick}
                    className="rounded-md px-3 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 hover:text-sky-700"
                  >
                    {secondaryCta.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Right: artwork */}
          <div className="flex items-center justify-center">
            {artwork ?? (
              <div className="relative h-64 w-44 rounded-[2rem] border-[6px] border-slate-900 bg-gradient-to-br from-sky-50 to-lime-50 shadow-md">
                <div className="absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-slate-900/80" />
                <div className="absolute inset-x-4 top-10 space-y-2">
                  <div className="h-2 w-3/4 rounded bg-slate-300" />
                  <div className="h-2 w-1/2 rounded bg-slate-300" />
                  <div className="mt-4 h-16 rounded bg-white shadow-inner" />
                  <div className="h-2 w-2/3 rounded bg-slate-300" />
                  <div className="h-2 w-1/2 rounded bg-slate-300" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
