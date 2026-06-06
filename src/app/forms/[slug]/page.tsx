/*
 * Public hosted web-to-lead form (Sprint 5). Unauthenticated. Resolves the
 * tenant from a validated `?t=<slug>` query param, loads the WebForm by [slug]
 * in that tenant schema, and renders its configured fields. Submission is
 * handled client-side (PublicFormClient) against /api/forms/[slug]/submit.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { PublicFormClient, type PublicFieldConfig } from "./PublicFormClient";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PublicFormPage({
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

  let form: { name: string; fieldsConfig: unknown; thankYouUrl: string | null; redirectUrl: string | null } | null = null;
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    form = await db.webForm.findUnique({
      where: { slug: params.slug },
      select: { name: true, fieldsConfig: true, thankYouUrl: true, redirectUrl: true },
    });
  } catch {
    form = null;
  }
  if (!form) return notFound;

  const fields = (form.fieldsConfig as PublicFieldConfig[] | null) ?? [];

  return (
    <Shell>
      <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
        {form.name}
      </h1>
      <PublicFormClient
        tenantSlug={tenantSlug}
        formSlug={params.slug}
        fields={fields}
        thankYouUrl={form.thankYouUrl}
        redirectUrl={form.redirectUrl}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="kobia-crm min-h-screen w-full"
      style={{ backgroundColor: "var(--kb-surface-grey)", padding: "48px 16px" }}
    >
      <div
        className="mx-auto rounded p-6"
        style={{
          maxWidth: "520px",
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
