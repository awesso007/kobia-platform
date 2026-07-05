/*
 * Form builder page (Sprint 19). Server component that loads the form with its
 * steps and fields and renders the three-pane builder client.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { getForm } from "@/lib/forms2/queries";
import { FormBuilder, type BuilderField, type BuilderForm, type BuilderStep } from "../FormBuilderUI";

export const dynamic = "force-dynamic";

export default async function FormBuilderPage({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const form = await getForm(db, params.id);
    if (!form) notFound();

    const builderForm: BuilderForm = {
      id: form.id,
      name: form.name,
      slug: form.slug,
      status: form.status,
      description: form.description,
      successMessage: form.successMessage,
      redirectUrl: form.redirectUrl,
      submitButtonLabel: form.submitButtonLabel,
    };
    const steps: BuilderStep[] = form.steps.map((s) => ({ id: s.id, order: s.order, title: s.title, description: s.description }));
    const fields: BuilderField[] = form.fields.map((f) => ({
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
      <div>
        <div className="px-4 pt-3 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/forms2">Forms</Link>
          {" / "}
          <Link href={`/app/forms2/${form.id}/submissions`}>Submissions</Link>
          {" / "}
          <Link href={`/app/forms2/${form.id}/analytics`}>Analytics</Link>
        </div>
        <FormBuilder form={builderForm} steps={steps} fields={fields} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
