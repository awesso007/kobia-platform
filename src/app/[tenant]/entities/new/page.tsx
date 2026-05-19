import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { provisionEntity } from "@/lib/accounting/provision-entity";
import { SUPPORTED_INDUSTRIES } from "@/lib/accounting/chart-of-accounts-templates";
import { cookieKeyForTenant } from "@/lib/active-entity";
import { checkLimit } from "@/lib/feature-gate";

async function createEntityAction(formData: FormData) {
  "use server";
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legalName") ?? "").trim() || undefined;
  const ein = String(formData.get("ein") ?? "").trim() || undefined;
  const industry = String(formData.get("industry") ?? "").trim() || undefined;
  const fiscalYearEnd = String(formData.get("fiscalYearEnd") ?? "12-31").trim() || "12-31";
  const baseCurrency = String(formData.get("baseCurrency") ?? "USD").trim() || "USD";

  if (!tenantSlug || !name) {
    throw new Error("Tenant slug and entity name are required.");
  }

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Not authenticated.");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    throw new Error("Only accountants and owners can create entities.");
  }

  // Enforce multi_entity tier limit
  const currentCount = await db.entity.count({ where: { tenantId: auth.tenant.id } });
  const limitCheck = await checkLimit(tenantSlug, "multi_entity", currentCount);
  if (!limitCheck.allowed) {
    redirect(`/${tenantSlug}/settings/billing?gate=multi_entity`);
  }

  // Check duplicate name within tenant
  const existing = await db.entity.findFirst({
    where: { tenantId: auth.tenant.id, name },
  });
  if (existing) {
    throw new Error(`An entity named "${name}" already exists for this tenant.`);
  }

  const entity = await provisionEntity({
    tenantId: auth.tenant.id,
    name,
    legalName,
    ein,
    industry,
    fiscalYearEnd,
    baseCurrency,
  });

  // Set this as the active entity immediately.
  cookies().set(cookieKeyForTenant(tenantSlug), entity.id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(`/${tenantSlug}/books`);
}

export default async function NewEntityPage({ params }: { params: { tenant: string } }) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${params.tenant}/books`);
  }

  // Check limit before showing the form
  const currentCount = await db.entity.count({ where: { tenantId: auth.tenant.id } });
  const limitCheck = await checkLimit(params.tenant, "multi_entity", currentCount);
  if (!limitCheck.allowed) {
    redirect(`/${params.tenant}/settings/billing?gate=multi_entity`);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Entity</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create a new set of books. Each entity gets its own chart of accounts, journal entries, and reports.
        </p>
      </div>

      <form action={createEntityAction} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="tenantSlug" value={params.tenant} />

        <Field label="Entity name" required hint="The trade name you use for this set of books (e.g., 'Acme LLC').">
          <input
            type="text"
            name="name"
            required
            maxLength={120}
            placeholder="Acme LLC"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Legal name" hint="Optional. The full legal name on tax filings.">
          <input
            type="text"
            name="legalName"
            maxLength={200}
            placeholder="Acme Holdings, LLC"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="EIN" hint="Optional. Format: 12-3456789.">
          <input
            type="text"
            name="ein"
            maxLength={20}
            placeholder="12-3456789"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Industry" hint="Pre-seeds an industry-specific chart of accounts.">
          <select
            name="industry"
            defaultValue=""
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— General (no industry add-ons) —</option>
            {SUPPORTED_INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {prettyIndustry(i)}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Fiscal year end" hint="MM-DD. Most US businesses use 12-31.">
            <input
              type="text"
              name="fiscalYearEnd"
              defaultValue="12-31"
              pattern="\d{2}-\d{2}"
              maxLength={5}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>
          <Field label="Base currency" hint="3-letter ISO code.">
            <input
              type="text"
              name="baseCurrency"
              defaultValue="USD"
              maxLength={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <a
            href={`/${params.tenant}/books`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </a>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create entity
          </button>
        </div>
      </form>

      <p className="mt-4 text-xs text-slate-500">
        Tip: opening balances can be posted after creation as a manual journal entry.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {hint && <p className="mb-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

function prettyIndustry(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
