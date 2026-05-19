import Link from "next/link";

export default function RootPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl space-y-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight">KOBIA.AI</h1>
        <p className="text-xl text-muted-foreground">
          Multi-tenant SaaS platform. Phase 1: AI-native accounting.
        </p>
        <p className="text-sm text-muted-foreground">
          Launching February 15, 2027. Currently in pre-launch development (Cycle 1).
        </p>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/demo/login"
            className="rounded-lg border border-border bg-card p-6 transition hover:border-primary hover:shadow-md"
          >
            <h3 className="font-semibold">Demo tenant</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try KOBIA at <code>/demo</code> with sample data.
            </p>
          </Link>
          <Link
            href="/fig/login"
            className="rounded-lg border border-border bg-card p-6 transition hover:border-primary hover:shadow-md"
          >
            <h3 className="font-semibold">FIG (internal)</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Fiscal Integrity Group — first internal customer.
            </p>
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Production: each tenant will live at <code>&#123;tenant&#125;.kobia.ai</code> (Lock EEEE).
        </p>
      </div>
    </main>
  );
}
