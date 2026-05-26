import Link from "next/link";

export const dynamic = "force-dynamic";

const HIGHLIGHTS = [
  {
    title: "AI-native bookkeeping",
    body: "Categorization, reconciliation, and month-end close that learn from how you run your books.",
  },
  {
    title: "Built for accountants and business owners",
    body: "Multi-entity, multi-currency, with practice management, client portal, and engagement letters.",
  },
  {
    title: "Your brand, not ours",
    body: "White-label on paid plans. Your logo, your colors, your domain. We disappear.",
  },
];

const MODULES = [
  "Books · GL, journal, trial balance",
  "AR · invoices, recurring, statements",
  "AP · bills, approvals, 1099",
  "Bank · reconciliation, rules, imports",
  "Payroll · pay runs, W-2, 941/940",
  "Tax · filings tracker, 1099-NEC/MISC",
  "CRM · leads, deals, pipelines",
  "Practice · engagements, time, letters",
  "Reports · P&L, BS, Cash Flow, GL, more",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-slate-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-64.png" alt="KOBIA" className="h-6 w-auto" />
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-slate-700">
            <Link href="/pricing" className="hover:text-slate-900">
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

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <div className="mx-auto flex h-20 w-fit items-center justify-center rounded-2xl bg-slate-900 px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-64.png" alt="KOBIA" className="h-12 w-auto" />
        </div>
        <h1 className="mt-8 text-5xl font-bold tracking-tight text-slate-900">
          AI-native accounting,
          <br />
          built for your firm.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          KOBIA is a complete platform for accountants, mortgage brokers, and real
          estate professionals. Books, payroll, tax, CRM, and practice management —
          one workspace, your brand on top.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Start free
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300"
          >
            See pricing
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-500">Public launch · February 15, 2027.</p>
      </section>

      {/* Highlights */}
      <section className="border-y border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="rounded-lg bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-900">{h.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold text-slate-900">
          One platform. Every workflow.
        </h2>
        <p className="mt-2 max-w-2xl text-slate-600">
          KOBIA replaces a stack of disconnected tools with one continuously-up-to-date
          source of truth.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {MODULES.map((m) => (
            <div
              key={m}
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700"
            >
              {m}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-100 bg-slate-900 py-16 text-center">
        <h2 className="text-3xl font-bold text-white">Start free. Upgrade when you scale.</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-300">
          No credit card required for the Starter tier. Pick a plan when you are ready
          to add entities, payroll, or hide our badge.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Create your workspace
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-white transition hover:border-slate-400"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white py-8 text-center text-xs text-slate-500">
        <p>© 2026 KOBIA.AI</p>
      </footer>
    </main>
  );
}
