import Link from "next/link";
import { TIERS } from "@/lib/tier-config";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white">
      <nav className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-64.png" alt="KOBIA" className="h-6 w-auto" />
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium text-slate-700">
            <Link href="/pricing" className="text-slate-900">
              Pricing
            </Link>
            <Link href="/signup" className="hover:text-slate-900">
              Sign up
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">
            Simple, transparent pricing.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Start free. Upgrade when you need more entities, payroll, or white-labeling.
            Cancel anytime.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((t) => (
            <div
              key={t.key}
              className={`flex flex-col rounded-2xl border p-6 ${
                t.recommended
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                  : "border-slate-200 bg-white text-slate-900"
              }`}
            >
              {t.recommended ? (
                <span className="mb-3 inline-flex w-fit rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-900">
                  Most popular
                </span>
              ) : null}

              <h3 className="text-lg font-semibold">{t.label}</h3>
              <p className={`mt-1 text-sm ${t.recommended ? "text-slate-300" : "text-slate-500"}`}>
                {t.tagline}
              </p>

              <p className="mt-4 text-3xl font-bold">{t.priceLabel}</p>
              <p className={`text-xs ${t.recommended ? "text-slate-300" : "text-slate-500"}`}>
                {t.audience}
              </p>

              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {t.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <span className={t.recommended ? "text-emerald-400" : "text-emerald-600"}>
                      ✓
                    </span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className={`mt-6 block rounded-lg px-4 py-2 text-center text-sm font-semibold ${
                  t.recommended
                    ? "bg-white text-slate-900 hover:bg-slate-100"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl bg-slate-50 p-8 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">Need something custom?</h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">
            Multi-firm rollouts, enterprise SSO, dedicated support, or API access at scale —
            reach out and we will build a plan that fits.
          </p>
          <a
            href="mailto:hello@kobia.ai"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Contact sales
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white py-8 text-center text-xs text-slate-500">
        <p>© 2026 KOBIA.AI</p>
      </footer>
    </main>
  );
}
