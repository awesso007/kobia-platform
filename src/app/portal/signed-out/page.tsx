export const dynamic = "force-dynamic";

export default function SignedOutPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Signed out</h1>
        <p className="mt-2 text-sm text-slate-600">
          You&rsquo;ve been signed out of the portal. Ask your firm for a fresh
          sign-in link to return.
        </p>
      </div>
    </div>
  );
}
