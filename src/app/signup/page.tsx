import Link from "next/link";
import { TIERS } from "@/lib/tier-config";

export const metadata = {
  title: "Pricing — KOBIA.AI",
  description: "AI-native accounting for solo operators and firms. Start free.",
};

export default function SignupPricingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          KOBIA<span className="text-slate-400">.AI</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900">
            Home
          </Link>
          <Link
            href="/fig/login"
            className="rounded-md border border-slate-200 px-4 py-1.5 font-medium hover:bg-slate-50"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-12 pt-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          One platform. Your books, your brand.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          AI-native accounting with the polish of a $400/mo SaaS — at a price that respects
          your runway. Start free. Upgrade when you&apos;re ready.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-20 md:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <div
            key={tier.key}
            className={`relative flex flex-col rounded-xl border bg-white p-6 ${
              tier.recommended
                ? "border-slate-900 shadow-lg ring-1 ring-slate-900"
                : "border-slate-200"
            }`}
          >
            {tier.recommended && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                Most popular
              </span>
            )}
            <div className="mb-2">
              <h3 className="text-lg font-semibold text-slate-900">{tier.label}</h3>
              <p className="text-xs text-slate-500">{tier.audience}</p>
            </div>
            <div className="mb-4">
              <span className="text-3xl font-bold tracking-tight text-slate-900">
                {tier.price === 0 ? "Free" : `$${tier.price}`}
              </span>
              {tier.price !== 0 && tier.price !== null && (
                <span className="text-sm text-slate-500">/mo</span>
              )}
            </div>
            <p className="mb-4 text-sm text-slate-700">{tier.tagline}</p>
            <ul className="mb-6 flex-1 space-y-2 text-sm text-slate-600">
              {tier.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2">
                  <Check />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/signup/start?tier=${tier.key}`}
              className={`block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                tier.recommended
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "border border-slate-200 text-slate-900 hover:bg-slate-50"
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="rounded-2xl bg-slate-50 p-8 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">Need something custom?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Enterprise plans include unlimited entities, SSO, dedicated support, and custom
            integrations. Talk to us.
          </p>
          <a
            href="mailto:hello@kobia.ai"
            className="mt-4 inline-block rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Contact sales
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        © 2026 KOBIA.AI · Made with care for accountants, by an accountant&apos;s platform.
      </footer>
    </main>
  );
}

function Check() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
