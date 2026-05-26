import Link from "next/link";

export default function RootPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
      <div className="max-w-2xl space-y-6 text-center">
        <div className="mx-auto flex h-24 w-fit items-center justify-center rounded-2xl bg-slate-900 px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-64.png" alt="KOBIA" className="h-14 w-auto" />
        </div>
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
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Public launch · February 15, 2027.
        </p>
      </div>
    </main>
  );
}
