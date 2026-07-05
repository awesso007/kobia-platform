/*
 * Public Forms 2.0 renderer page (Sprint 19). Unauthenticated. Resolves the
 * tenant from a validated `?t=<slug>` query param, loads the PUBLISHED FormV2 by
 * [slug] in that tenant schema, logs a VIEW analytics event, and renders the
 * multi-step wizard (PublicFormUI). Submission/tracking/payment run client-side.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { getFormBySlug } from "@/lib/forms2/queries";
import type { PublicField, PublicForm, PublicStep } from "@/lib/forms2/form-utils";
import { PublicFormUI } from "./PublicFormUI";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PublicFormV2Page({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tParam = Array.isArray(searchParams.t) ? searchParams.t[0] : searchParams.t;
  const tenantSlug = sanitizeSlug(tParam);

  const notFound = (
    <Shell>
      <p style={{ color: "var(--kb-text-secondary)" }}>This form is not available.</p>
    </Shell>
  );

  if (!tenantSlug) return notFound;

  let db: ReturnType<typeof getTenantPrisma> | null = null;
  let form: Awaited<ReturnType<typeof getFormBySlug>> = null;
  try {
    db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    form = await getFormBySlug(db, params.slug);
  } catch {
    form = null;
  }
  if (!form || form.status !== "PUBLISHED") return notFound;

  if (db) {
    await db.formV2Analytics
      .create({ data: { formId: form.id, event: "VIEW" } })
      .catch(() => undefined);
  }

  const publicForm: PublicForm = {
    name: form.name,
    description: form.description,
    successMessage: form.successMessage,
    redirectUrl: form.redirectUrl,
    submitButtonLabel: form.submitButtonLabel,
  };
  const steps: PublicStep[] = form.steps.map((s) => ({
    id: s.id,
    order: s.order,
    title: s.title,
    description: s.description,
  }));
  const fields: PublicField[] = form.fields.map((f) => ({
    id: f.id,
    stepId: f.stepId,
    order: f.order,
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder,
    helpText: f.helpText,
    options: f.options,
    validation: f.validation,
    defaultValue: f.defaultValue,
    calculation: f.calculation,
    paymentAmount: f.paymentAmount,
    paymentCurrency: f.paymentCurrency,
    paymentDescription: f.paymentDescription,
    visibilityRule: f.visibilityRule,
  }));

  return (
    <Shell>
      <h1 className="mb-2" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
        {publicForm.name}
      </h1>
      {publicForm.description && (
        <p className="mb-4 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {publicForm.description}
        </p>
      )}
      <PublicFormUI tenantSlug={tenantSlug} formSlug={params.slug} form={publicForm} steps={steps} fields={fields} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="kobia-crm min-h-screen w-full" style={{ backgroundColor: "var(--kb-surface-grey)", padding: "48px 16px" }}>
      <div
        className="mx-auto rounded p-6"
        style={{
          maxWidth: "560px",
          backgroundColor: "var(--kb-surface)",
          border: "1px solid var(--kb-border)",
          borderRadius: "var(--kb-radius)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
