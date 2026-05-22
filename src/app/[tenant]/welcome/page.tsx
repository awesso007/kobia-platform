import { notFound, redirect } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenant";
import { ensureMembership } from "@/lib/ensure-membership";
import {
  setTenantIndustry,
  createFirstEntity,
  inviteTeamMember,
  completeOnboarding,
  skipOnboarding,
} from "@/app/actions/onboarding-actions";

const INDUSTRY_OPTIONS: { value: string; label: string; blurb: string }[] = [
  { value: "PROFESSIONAL_SERVICES", label: "Professional Services", blurb: "Consulting, agencies, law firms, accounting" },
  { value: "SAAS", label: "SaaS / Software", blurb: "Subscriptions, deferred revenue, hosting costs" },
  { value: "REAL_ESTATE", label: "Real Estate", blurb: "Rentals, commissions, property management" },
  { value: "RESTAURANT", label: "Restaurant / Hospitality", blurb: "Food, beverage, tips, cost of goods" },
  { value: "RETAIL", label: "Retail / E-commerce", blurb: "Inventory, shipping, product sales" },
  { value: "HEALTHCARE", label: "Healthcare", blurb: "Patient + insurance AR, contractual adjustments" },
  { value: "CONSTRUCTION", label: "Construction", blurb: "WIP, change orders, subcontractors, materials" },
  { value: "GENERIC", label: "Other / Skip for now", blurb: "Use a generic chart of accounts — you can customize later" },
];

type Step = "industry" | "entity" | "team" | "done";

function normalizeStep(raw: string | undefined, current: string | null): Step {
  const allowed: Step[] = ["industry", "entity", "team", "done"];
  if (raw && (allowed as string[]).includes(raw)) return raw as Step;
  if (current && (allowed as string[]).includes(current)) return current as Step;
  return "industry";
}

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { step?: string };
}) {
  const tenant = await getTenantBySlug(params.tenant);
  if (!tenant) notFound();

  // Ensure the Clerk-authenticated user has a KOBIA User + Membership for
  // this tenant. First member becomes OWNER. This is idempotent.
  await ensureMembership(tenant.slug);

  // If already onboarded, send them straight to dashboard.
  if (tenant.onboardingCompleted) {
    redirect(`/${tenant.slug}/dashboard`);
  }

  const step = normalizeStep(searchParams.step, tenant.onboardingStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-[color:var(--primary,#0ea5e9)]">
            Welcome to KOBIA
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Let&apos;s get {tenant.name} set up
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Three quick steps. You can change anything later in Settings.
          </p>
        </header>

        <StepIndicator current={step} />

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          {step === "industry" && <IndustryStep slug={tenant.slug} current={tenant.industry} />}
          {step === "entity" && <EntityStep slug={tenant.slug} defaultName={tenant.name} />}
          {step === "team" && <TeamStep slug={tenant.slug} />}
          {step === "done" && <DoneStep slug={tenant.slug} tenantName={tenant.name} />}
        </div>

        <form action={skipOnboarding} className="mt-6 text-center">
          <input type="hidden" name="slug" value={tenant.slug} />
          <button
            type="submit"
            className="text-sm text-slate-500 underline-offset-4 hover:underline dark:text-slate-400"
          >
            Skip setup &mdash; I&apos;ll configure later
          </button>
        </form>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "industry", label: "Industry" },
    { id: "entity", label: "Entity" },
    { id: "team", label: "Team" },
    { id: "done", label: "Done" },
  ];
  const currentIndex = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-3">
      {steps.map((s, i) => {
        const isActive = i === currentIndex;
        const isComplete = i < currentIndex;
        return (
          <li key={s.id} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                isActive
                  ? "bg-[color:var(--primary,#0ea5e9)] text-white"
                  : isComplete
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {isComplete ? "✓" : i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                isActive ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-slate-300 dark:text-slate-700">&rarr;</span>}
          </li>
        );
      })}
    </ol>
  );
}

function IndustryStep({ slug, current }: { slug: string; current: string | null }) {
  return (
    <form action={setTenantIndustry}>
      <input type="hidden" name="slug" value={slug} />
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        What kind of business is this?
      </h2>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        We&apos;ll preload your chart of accounts with the right accounts for your industry.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INDUSTRY_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[color:var(--primary,#0ea5e9)] hover:shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <input
              type="radio"
              name="industry"
              value={opt.value}
              defaultChecked={
                (current ?? "GENERIC") === opt.value || (opt.value === "GENERIC" && !current)
              }
              required
              className="mt-1 h-4 w-4 accent-[color:var(--primary,#0ea5e9)]"
            />
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-50">{opt.label}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{opt.blurb}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-[color:var(--primary,#0ea5e9)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          Continue &rarr;
        </button>
      </div>
    </form>
  );
}

function EntityStep({ slug, defaultName }: { slug: string; defaultName: string }) {
  return (
    <form action={createFirstEntity}>
      <input type="hidden" name="slug" value={slug} />
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Set up your first entity
      </h2>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        An entity is the legal business that owns the books. Most accounts have one. You can add more later.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Entity name
          </label>
          <input
            type="text"
            name="name"
            defaultValue={defaultName}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[color:var(--primary,#0ea5e9)] focus:outline-none focus:ring-1 focus:ring-[color:var(--primary,#0ea5e9)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Fiscal year end
            </label>
            <select
              name="fiscalYearEnd"
              defaultValue="12-31"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[color:var(--primary,#0ea5e9)] focus:outline-none focus:ring-1 focus:ring-[color:var(--primary,#0ea5e9)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            >
              <option value="12-31">Dec 31 (calendar)</option>
              <option value="03-31">Mar 31</option>
              <option value="06-30">Jun 30</option>
              <option value="09-30">Sep 30</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Base currency
            </label>
            <select
              name="baseCurrency"
              defaultValue="USD"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[color:var(--primary,#0ea5e9)] focus:outline-none focus:ring-1 focus:ring-[color:var(--primary,#0ea5e9)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            >
              <option value="USD">USD &mdash; US Dollar</option>
              <option value="CAD">CAD &mdash; Canadian Dollar</option>
              <option value="EUR">EUR &mdash; Euro</option>
              <option value="GBP">GBP &mdash; British Pound</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <a
          href={`/${slug}/welcome?step=industry`}
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          &larr; Back
        </a>
        <button
          type="submit"
          className="rounded-lg bg-[color:var(--primary,#0ea5e9)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          Create entity &amp; continue &rarr;
        </button>
      </div>
    </form>
  );
}

function TeamStep({ slug }: { slug: string }) {
  return (
    <form action={inviteTeamMember}>
      <input type="hidden" name="slug" value={slug} />
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Invite a teammate (optional)
      </h2>
      <p className="mt-1 text-slate-600 dark:text-slate-400">
        Working with a bookkeeper, partner, or staff member? Send them an invite now &mdash; or do it later.
      </p>

      <div className="mt-6">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Email address
        </label>
        <input
          type="email"
          name="email"
          placeholder="teammate@example.com"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[color:var(--primary,#0ea5e9)] focus:outline-none focus:ring-1 focus:ring-[color:var(--primary,#0ea5e9)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Leave blank to skip. You can invite anyone later from Settings &rarr; Team.
        </p>
      </div>

      <div className="mt-8 flex justify-between">
        <a
          href={`/${slug}/welcome?step=entity`}
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          &larr; Back
        </a>
        <button
          type="submit"
          className="rounded-lg bg-[color:var(--primary,#0ea5e9)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          Continue &rarr;
        </button>
      </div>
    </form>
  );
}

function DoneStep({ slug, tenantName }: { slug: string; tenantName: string }) {
  return (
    <form action={completeOnboarding}>
      <input type="hidden" name="slug" value={slug} />
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600 dark:bg-emerald-900/30">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          You&apos;re all set, {tenantName}
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Your chart of accounts is seeded, your first entity is live, and your books are ready to go.
        </p>

        <ul className="mt-6 space-y-2 text-left text-sm text-slate-600 dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-500">✓</span>
            <span>Industry-tuned chart of accounts created</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-500">✓</span>
            <span>First entity provisioned and selected</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-500">✓</span>
            <span>Books, AR, AP, and reports unlocked</span>
          </li>
        </ul>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="submit"
          className="rounded-lg bg-[color:var(--primary,#0ea5e9)] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          Go to my dashboard &rarr;
        </button>
      </div>
    </form>
  );
}
