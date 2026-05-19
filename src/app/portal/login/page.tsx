export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That sign-in link is invalid.",
  expired: "That sign-in link has expired. Ask your firm to send a new one.",
  deactivated: "Your portal access has been disabled. Contact your firm.",
};

export default function PortalLoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const error = searchParams?.error ? ERRORS[searchParams.error] : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Client portal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in using the link your firm emailed you.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            Don&rsquo;t have a sign-in link? Contact your accountant and ask
            them to send you a portal invitation.
          </p>
        </div>
      </div>
    </div>
  );
}
