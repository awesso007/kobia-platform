import Link from "next/link";

export default function SignupCancelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">No charge yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          You cancelled before payment. Your slug is held for 24 hours if you want to come back.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/signup"
            className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Back to pricing
          </Link>
          <Link
            href="/signup/start?tier=FREE"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Or try the free plan
          </Link>
        </div>
      </div>
    </main>
  );
}
