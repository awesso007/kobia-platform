import Link from "next/link";

export default function RootPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl space-y-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight">KOBIA.AI</h1>
        <p className="text-xl text-muted-foreground">
          AI-native accounting, mortgage, and real estate platform. Your books, your brand.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Get started
          </Link>
          <Link
            href="/fig/login"
            className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/signup"
            className="rounded-lg border border-border bg-card p-6 text-left transition hover:border-primary hover:shadow-md"
          >
            <h3 className="font-semibold">See pricing</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Free, Solo, Firm, and Firm+. Start free, upgrade anytime.
            </p>
          </Link>
          <Link
            href="/fig/login"
            className="rounded-lg border border-border bg-card p-6 text-left transition hover:border-primary hover:shadow-md"
          >
            <h3 className="font-semibold">FIG (internal)</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Fiscal Integrity Group — first internal customer running on KOBIA.
            </p>
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Public launch · February 15, 2027.
        </p>
      </div>
    </main>
  );
}
