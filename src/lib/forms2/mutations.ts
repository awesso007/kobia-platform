/*
 * Forms 2.0 write helpers (Sprint 19). Every function takes an explicit db so it
 * runs inside a request scope or in the seed script. The public submit path
 * validates server-side, resolves CALCULATED fields, records analytics, may
 * create a Lead, and dispatches FORM_V2_SUBMIT (and FORM_V2_PAID once a payment
 * settles) so Workflows and classic automations can react.
 *
 * Slugs are unique per tenant; collisions get a short numeric suffix.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, FormFieldType } from "@/lib/db/generated/tenant";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { slugify, isValidSlug, evaluateCalculation, isPresentationField } from "./form-utils";
import { validateSubmission, type ValidatableField } from "./validation";

type Db = PrismaClient;

async function uniqueFormSlug(db: Db, base: string): Promise<string> {
  let slug = slugify(base) || "form";
  if (!isValidSlug(slug)) slug = "form";
  let candidate = slug;
  let n = 1;
  while (await db.formV2.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${slug}-${n++}`.slice(0, 50);
  }
  return candidate;
}

export async function createForm(
  db: Db,
  input: { name: string; slug?: string | null; description?: string | null },
): Promise<string> {
  const slug = await uniqueFormSlug(db, input.slug || input.name);
  const form = await db.formV2.create({
    data: {
      name: input.name.trim() || "Untitled form",
      slug,
      description: input.description?.trim() || null,
    },
  });
  // Every new form starts with one step so the builder has somewhere to add fields.
  await db.formStep.create({ data: { formId: form.id, order: 0, title: "Step 1" } });
  return form.id;
}

export async function updateForm(
  db: Db,
  formId: string,
  patch: Partial<{
    name: string;
    slug: string;
    description: string | null;
    successMessage: string | null;
    redirectUrl: string | null;
    submitButtonLabel: string;
    theme: unknown;
  }>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim() || "Untitled form";
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.successMessage !== undefined) data.successMessage = patch.successMessage || null;
  if (patch.redirectUrl !== undefined) data.redirectUrl = patch.redirectUrl || null;
  if (patch.submitButtonLabel !== undefined) data.submitButtonLabel = patch.submitButtonLabel.trim() || "Submit";
  if (patch.theme !== undefined) data.theme = patch.theme as never;
  if (patch.slug !== undefined) data.slug = await uniqueFormSlug(db, patch.slug);
  if (Object.keys(data).length === 0) return;
  await db.formV2.update({ where: { id: formId }, data });
}

export async function deleteForm(db: Db, formId: string): Promise<void> {
  await db.formV2.delete({ where: { id: formId } });
}

export async function setFormStatus(
  db: Db,
  formId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED",
): Promise<void> {
  await db.formV2.update({ where: { id: formId }, data: { status } });
}

// ---- Steps -------------------------------------------------------------------

export async function createStep(
  db: Db,
  formId: string,
  input: { title?: string; description?: string | null },
): Promise<string> {
  const last = await db.formStep.findFirst({ where: { formId }, orderBy: { order: "desc" }, select: { order: true } });
  const order = (last?.order ?? -1) + 1;
  const step = await db.formStep.create({
    data: {
      formId,
      order,
      title: input.title?.trim() || `Step ${order + 1}`,
      description: input.description?.trim() || null,
    },
  });
  return step.id;
}

export async function updateStep(
  db: Db,
  stepId: string,
  patch: Partial<{ title: string; description: string | null }>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title.trim() || "Untitled step";
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (Object.keys(data).length === 0) return;
  await db.formStep.update({ where: { id: stepId }, data });
}

export async function deleteStep(db: Db, stepId: string): Promise<void> {
  // Fields point at the step with onDelete: SetNull, so they survive as orphans
  // on the form; the builder reassigns or removes them.
  await db.formStep.delete({ where: { id: stepId } });
}

export async function reorderSteps(db: Db, formId: string, orderedIds: string[]): Promise<void> {
  const existing = await db.formStep.findMany({ where: { formId }, select: { id: true } });
  const valid = new Set(existing.map((s) => s.id));
  await db.$transaction(
    orderedIds.filter((id) => valid.has(id)).map((id, idx) => db.formStep.update({ where: { id }, data: { order: idx } })),
  );
}

// ---- Fields ------------------------------------------------------------------

async function uniqueFieldKey(db: Db, formId: string, base: string, ignoreId?: string): Promise<string> {
  let candidate = base || "field";
  let n = 1;
  for (;;) {
    const hit = await db.formField.findFirst({
      where: { formId, key: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!hit) return candidate;
    candidate = `${base}_${n++}`.slice(0, 40);
  }
}

export type CreateFieldInput = {
  stepId?: string | null;
  type: FormFieldType;
  label: string;
  key?: string;
  required?: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  options?: unknown;
  validation?: unknown;
  defaultValue?: string | null;
  calculation?: string | null;
  paymentAmount?: number | null;
  paymentCurrency?: string;
  paymentDescription?: string | null;
  visibilityRule?: unknown;
};

export async function createField(db: Db, formId: string, input: CreateFieldInput): Promise<string> {
  const last = await db.formField.findFirst({
    where: { formId, stepId: input.stepId ?? undefined },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const base = slugify(input.key || input.label).replace(/-/g, "_") || "field";
  const key = await uniqueFieldKey(db, formId, base);
  const field = await db.formField.create({
    data: {
      formId,
      stepId: input.stepId ?? null,
      order: (last?.order ?? -1) + 1,
      key,
      label: input.label.trim() || "Untitled",
      type: input.type,
      required: input.required ?? false,
      placeholder: input.placeholder ?? null,
      helpText: input.helpText ?? null,
      options: (input.options ?? undefined) as never,
      validation: (input.validation ?? undefined) as never,
      defaultValue: input.defaultValue ?? null,
      calculation: input.calculation ?? null,
      paymentAmount: input.paymentAmount ?? null,
      paymentCurrency: input.paymentCurrency ?? "USD",
      paymentDescription: input.paymentDescription ?? null,
      visibilityRule: (input.visibilityRule ?? undefined) as never,
    },
  });
  return field.id;
}

export async function updateField(
  db: Db,
  fieldId: string,
  patch: Partial<Omit<CreateFieldInput, "type"> & { type: FormFieldType; stepId: string | null }>,
): Promise<void> {
  const existing = await db.formField.findUnique({ where: { id: fieldId }, select: { formId: true } });
  if (!existing) return;
  const data: Record<string, unknown> = {};
  if (patch.label !== undefined) data.label = patch.label.trim() || "Untitled";
  if (patch.type !== undefined) data.type = patch.type;
  if (patch.required !== undefined) data.required = patch.required;
  if (patch.placeholder !== undefined) data.placeholder = patch.placeholder || null;
  if (patch.helpText !== undefined) data.helpText = patch.helpText || null;
  if (patch.options !== undefined) data.options = (patch.options ?? undefined) as never;
  if (patch.validation !== undefined) data.validation = (patch.validation ?? undefined) as never;
  if (patch.defaultValue !== undefined) data.defaultValue = patch.defaultValue || null;
  if (patch.calculation !== undefined) data.calculation = patch.calculation || null;
  if (patch.paymentAmount !== undefined) data.paymentAmount = patch.paymentAmount ?? null;
  if (patch.paymentCurrency !== undefined) data.paymentCurrency = patch.paymentCurrency || "USD";
  if (patch.paymentDescription !== undefined) data.paymentDescription = patch.paymentDescription || null;
  if (patch.visibilityRule !== undefined) data.visibilityRule = (patch.visibilityRule ?? undefined) as never;
  if (patch.stepId !== undefined) data.stepId = patch.stepId;
  if (patch.key !== undefined) {
    const base = slugify(patch.key).replace(/-/g, "_") || "field";
    data.key = await uniqueFieldKey(db, existing.formId, base, fieldId);
  }
  if (Object.keys(data).length === 0) return;
  await db.formField.update({ where: { id: fieldId }, data });
}

export async function deleteField(db: Db, fieldId: string): Promise<void> {
  await db.formField.delete({ where: { id: fieldId } });
}

export async function reorderFields(db: Db, formId: string, orderedIds: string[]): Promise<void> {
  const existing = await db.formField.findMany({ where: { formId }, select: { id: true } });
  const valid = new Set(existing.map((f) => f.id));
  await db.$transaction(
    orderedIds
      .filter((id) => valid.has(id))
      .map((id, idx) => db.formField.update({ where: { id }, data: { order: idx } })),
  );
}

// ---- Public submission -------------------------------------------------------

export type SubmitMeta = { userAgent?: string | null; referrer?: string | null; ipHash?: string | null };

export type SubmitResult =
  | { ok: false; errors: Record<string, string> }
  | {
      ok: true;
      submissionId: string;
      status: string;
      requiresPayment: boolean;
      amountCents: number | null;
      currency: string;
    };

/** Fill in CALCULATED fields from the submitted values so they are stored too. */
function applyCalculations(
  fields: { key: string; type: string; calculation: string | null }[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...values };
  for (const f of fields) {
    if (f.type === "CALCULATED") {
      const n = evaluateCalculation(f.calculation, out);
      out[f.key] = n ?? 0;
    }
  }
  return out;
}

function deriveLead(
  fields: { key: string; type: string }[],
  values: Record<string, unknown>,
): { name: string; email: string | null; phone: string | null } | null {
  const emailField = fields.find((f) => f.type === "EMAIL");
  const phoneField = fields.find((f) => f.type === "PHONE");
  const email = emailField ? String(values[emailField.key] ?? "").trim() || null : null;
  const phone = phoneField ? String(values[phoneField.key] ?? "").trim() || null : null;

  const nameParts = fields
    .filter((f) => (f.type === "SHORT_TEXT" || f.type === "HIDDEN") && /name/i.test(f.key))
    .map((f) => String(values[f.key] ?? "").trim())
    .filter(Boolean);
  const name = nameParts.join(" ").trim() || email;
  if (!name) return null;
  return { name, email, phone };
}

/**
 * Validate and record a public submission. When the form has a PAYMENT field the
 * submission is left PENDING with the amount to collect; otherwise it is
 * COMPLETED immediately and FORM_V2_SUBMIT is dispatched.
 */
export async function submitForm(
  db: Db,
  slug: string,
  rawValues: Record<string, unknown>,
  meta: SubmitMeta = {},
): Promise<SubmitResult | null> {
  const form = await db.formV2.findUnique({
    where: { slug },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!form || form.status !== "PUBLISHED") return null;

  const validatable: ValidatableField[] = form.fields
    .filter((f) => !isPresentationField(f.type))
    .map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      validation: f.validation,
      visibilityRule: f.visibilityRule,
    }));

  const result = validateSubmission(validatable, rawValues);
  if (!result.ok) return { ok: false, errors: result.errors };

  const values = applyCalculations(
    form.fields.map((f) => ({ key: f.key, type: f.type, calculation: f.calculation })),
    rawValues,
  );

  const paymentField = form.fields.find((f) => f.type === "PAYMENT");
  const requiresPayment = !!paymentField && (paymentField.paymentAmount ?? 0) > 0;
  const amountCents = paymentField?.paymentAmount ?? null;
  const currency = paymentField?.paymentCurrency ?? "USD";

  let leadId: string | null = null;
  const lead = deriveLead(
    form.fields.map((f) => ({ key: f.key, type: f.type })),
    values,
  );
  if (lead) {
    const created = await db.lead
      .create({ data: { name: lead.name, email: lead.email, phone: lead.phone, source: "WEBSITE" } })
      .catch(() => null);
    leadId = created?.id ?? null;
  }

  const submission = await db.formV2Submission.create({
    data: {
      formId: form.id,
      status: requiresPayment ? "PENDING" : "COMPLETED",
      data: values as never,
      meta: {
        userAgent: meta.userAgent ?? null,
        referrer: meta.referrer ?? null,
        ipHash: meta.ipHash ?? null,
      } as never,
      leadId,
      amountCents,
      currency,
    },
  });

  await db.formV2Analytics
    .create({ data: { formId: form.id, event: "SUBMIT_SUCCESS", ipHash: meta.ipHash ?? null } })
    .catch(() => undefined);

  if (!requiresPayment) {
    await dispatchAutomation(
      {
        type: "FORM_V2_SUBMIT",
        entityType: "FORM_V2",
        entityId: submission.id,
        record: values,
        payload: { formId: form.id, slug: form.slug, leadId },
      },
      db,
    ).catch(() => undefined);
  }

  return {
    ok: true,
    submissionId: submission.id,
    status: submission.status,
    requiresPayment,
    amountCents,
    currency,
  };
}

/**
 * Mark a submission paid (stub Stripe scaffolding: we trust the client's
 * confirmation for v0.1). Sets PAID + paidAt, records analytics, and dispatches
 * FORM_V2_PAID then FORM_V2_SUBMIT so downstream automations still fire.
 */
export async function markSubmissionPaid(
  db: Db,
  submissionId: string,
  paymentIntentId?: string | null,
): Promise<boolean> {
  const submission = await db.formV2Submission.findUnique({ where: { id: submissionId } });
  if (!submission || submission.status === "PAID") return false;

  await db.formV2Submission.update({
    where: { id: submissionId },
    data: { status: "PAID", paidAt: new Date(), paymentIntentId: paymentIntentId ?? null },
  });

  const form = await db.formV2.findUnique({ where: { id: submission.formId }, select: { slug: true } });
  await db.formV2Analytics
    .create({ data: { formId: submission.formId, event: "PAYMENT_SUCCESS" } })
    .catch(() => undefined);

  const record = (submission.data ?? {}) as Record<string, unknown>;
  await dispatchAutomation(
    {
      type: "FORM_V2_PAID",
      entityType: "FORM_V2",
      entityId: submission.id,
      record,
      payload: { formId: submission.formId, slug: form?.slug, leadId: submission.leadId },
    },
    db,
  ).catch(() => undefined);
  await dispatchAutomation(
    {
      type: "FORM_V2_SUBMIT",
      entityType: "FORM_V2",
      entityId: submission.id,
      record,
      payload: { formId: submission.formId, slug: form?.slug, leadId: submission.leadId },
    },
    db,
  ).catch(() => undefined);

  return true;
}

/** Record a public analytics event; never throws (tracking is best-effort). */
export async function trackFormEvent(
  db: Db,
  slug: string,
  event: string,
  extra: { stepId?: string | null; path?: string | null; referrer?: string | null; ipHash?: string | null } = {},
): Promise<void> {
  const ALLOWED = [
    "VIEW",
    "STEP_ADVANCE",
    "STEP_BACK",
    "SUBMIT_ATTEMPT",
    "SUBMIT_SUCCESS",
    "PAYMENT_INIT",
    "PAYMENT_SUCCESS",
    "PAYMENT_FAILED",
  ];
  if (!ALLOWED.includes(event)) return;
  const form = await db.formV2.findUnique({ where: { slug }, select: { id: true } });
  if (!form) return;
  await db.formV2Analytics
    .create({
      data: {
        formId: form.id,
        stepId: extra.stepId ?? null,
        event: event as never,
        path: extra.path ?? null,
        referrer: extra.referrer ?? null,
        ipHash: extra.ipHash ?? null,
      },
    })
    .catch(() => undefined);
}
