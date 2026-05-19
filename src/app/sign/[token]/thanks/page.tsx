export const dynamic = "force-dynamic";

export default function SignedThanksPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          ✓
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Letter signed
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Thank you. Your accountant has been notified and you&rsquo;ll receive a copy for your records by email.
        </p>
      </div>
    </div>
  );
}
