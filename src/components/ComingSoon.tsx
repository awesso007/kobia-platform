import Link from "next/link";

export function ComingSoon({
  module,
  feature,
  description,
  eta,
  backHref,
}: {
  module: string;
  feature: string;
  description: string;
  eta?: string;
  backHref?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{module}</p>
        <h1 className="mt-2 text-3xl font-semibold">{feature}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">{description}</p>
        {eta && (
          <p className="mt-6 inline-block rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            Target: {eta}
          </p>
        )}
        {backHref && (
          <div className="mt-8">
            <Link href={backHref} className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline">
              ← Back
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
