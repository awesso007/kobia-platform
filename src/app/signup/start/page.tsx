import Link from "next/link";
import { redirect } from "next/navigation";
import { getTier } from "@/lib/tier-config";
import { startSignupAndRedirect } from "@/app/actions/signup-actions";
import type { TenantTier } from "@prisma/client";

export const dynamic = "force-dynamic";

export default function SignupStartPage({
  searchParams,
}: {
  searchParams: {
    tier?: string;
    error?: string;
    slug?: string;
    businessName?: string;
    email?: string;
  };
}) {
  const tierKey = (searchParams.tier ?? "FREE") as TenantTier;
  const tier = getTier(tierKey);
  if (!tier || (tierKey !== "FREE" && tierKey !== "SOLO" && tierKey !== "FIRM" && tierKey !== "FIRM_PLUS")) {
    redirect("/signup");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          KOBIA<span className="text-slate-400">.AI</span>
        </Link>
        <Link href="/signup" className="text-sm text-slate-600 hover:text-slate-900">
          ← Back to pricing
        </Link>
      </header>

      <div className="mx-auto max-w-xl px-6 pb-16 pt-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Step 1 of {tierKey === "FREE" ? "1" : "2"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Set up your {tier!.label} workspace</h1>
            <p className="mt-1 text-sm text-slate-600">
              {tier!.priceLabel}
              {tierKey !== "FREE" && " · cancel anytime"}
            </p>
          </div>

          {searchParams.error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {searchParams.error}
            </div>
          )}

          <form action={startSignupAndRedirect} className="space-y-4">
            <input type="hidden" name="tier" value={tierKey} />

            <Field
              label="Business name"
              name="businessName"
              required
              placeholder="Acme Bookkeeping LLC"
              defaultValue={searchParams.businessName}
              help="Shown at the top of your workspace."
            />

            <SlugField defaultValue={searchParams.slug} />

            <Field
              label="Email"
              name="email"
              type="email"
              required
              placeholder="you@acme.com"
              defaultValue={searchParams.email}
              help={tierKey === "FREE" ? "We'll send your login link here." : "Used for your account + billing."}
            />

            <Field
              label="Legal entity name (optional)"
              name="legalName"
              placeholder="Acme Bookkeeping LLC"
              help="If different from business name. You can change this later."
            />

            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {tierKey === "FREE" ? "Create my workspace" : `Continue to checkout · ${tier!.priceLabel}`}
            </button>

            {tierKey !== "FREE" && (
              <p className="text-center text-xs text-slate-500">
                Secure payment by Stripe. No setup fees. Cancel anytime in your billing portal.
              </p>
            )}
          </form>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm">
          <p className="mb-2 font-semibold text-slate-900">What you get with {tier!.label}:</p>
          <ul className="space-y-1.5 text-slate-600">
            {tier!.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                {h}
              </li>
            ))}
          </ul>
        </div>

        {tierKey !== "FREE" && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Want to try first?{" "}
            <Link
              href="/signup/start?tier=FREE"
              className="font-medium text-slate-700 underline-offset-4 hover:underline"
            >
              Start with the free plan
            </Link>{" "}
            and upgrade anytime.
          </p>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  help?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      {help && <p className="mt-1 text-xs text-slate-500">{help}</p>}
    </div>
  );
}

function SlugField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div>
      <label htmlFor="slug" className="mb-1 block text-sm font-medium text-slate-700">
        Workspace URL <span className="text-red-500">*</span>
      </label>
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400">
        <span className="px-3 py-2 text-sm text-slate-400">kobia.ai/</span>
        <input
          id="slug"
          name="slug"
          required
          pattern="[a-z][a-z0-9-]{2,30}[a-z0-9]"
          placeholder="acme"
          defaultValue={defaultValue}
          className="flex-1 border-0 bg-transparent px-0 py-2 text-sm focus:outline-none focus:ring-0"
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Lowercase letters, numbers, hyphens. 4–32 characters. Cannot be changed later.
      </p>
    </div>
  );
}
