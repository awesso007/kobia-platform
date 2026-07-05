/*
 * Forms 2.0 read helpers (Sprint 19). Every function takes an explicit db so it
 * works inside a request scope (getTenantDb) and outside one (getTenantPrisma by
 * slug, used by the public renderer and the seed script).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient, FormV2, FormStep, FormField } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

export type FormSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  fieldCount: number;
  stepCount: number;
  submissionCount: number;
  updatedAt: Date;
};

export async function listForms(db: Db): Promise<FormSummary[]> {
  const forms = await db.formV2.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { fields: true, steps: true, submissions: true } } },
  });
  return forms.map((f) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    status: f.status,
    description: f.description,
    fieldCount: f._count.fields,
    stepCount: f._count.steps,
    submissionCount: f._count.submissions,
    updatedAt: f.updatedAt,
  }));
}

export type FormWithContent = FormV2 & {
  steps: FormStep[];
  fields: FormField[];
};

/** Full form for the builder and the public renderer: steps + fields ordered. */
export async function getForm(db: Db, formId: string): Promise<FormWithContent | null> {
  return db.formV2.findUnique({
    where: { id: formId },
    include: {
      steps: { orderBy: { order: "asc" } },
      fields: { orderBy: { order: "asc" } },
    },
  });
}

export async function getFormBySlug(db: Db, slug: string): Promise<FormWithContent | null> {
  return db.formV2.findUnique({
    where: { slug },
    include: {
      steps: { orderBy: { order: "asc" } },
      fields: { orderBy: { order: "asc" } },
    },
  });
}

export type SubmissionSummary = {
  id: string;
  status: string;
  data: Record<string, unknown>;
  amountCents: number | null;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
};

export async function listSubmissions(db: Db, formId: string, limit = 200): Promise<SubmissionSummary[]> {
  const rows = await db.formV2Submission.findMany({
    where: { formId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((s) => ({
    id: s.id,
    status: s.status,
    data: (s.data ?? {}) as Record<string, unknown>,
    amountCents: s.amountCents,
    currency: s.currency,
    paidAt: s.paidAt,
    createdAt: s.createdAt,
  }));
}

export async function getSubmission(db: Db, formId: string, submissionId: string) {
  const row = await db.formV2Submission.findUnique({ where: { id: submissionId } });
  if (!row || row.formId !== formId) return null;
  return row;
}

export type StepFunnelRow = {
  stepId: string | null;
  title: string;
  order: number;
  advances: number;
};

export type FormAnalytics = {
  views: number;
  submitAttempts: number;
  submitSuccess: number;
  paymentSuccess: number;
  conversionRate: number;
  stepFunnel: StepFunnelRow[];
};

/** View/submit funnel and per-step advance counts for the analytics page. */
export async function getFormAnalytics(db: Db, formId: string): Promise<FormAnalytics> {
  const [grouped, steps] = await Promise.all([
    db.formV2Analytics.groupBy({ by: ["event"], where: { formId }, _count: { _all: true } }),
    db.formStep.findMany({ where: { formId }, orderBy: { order: "asc" } }),
  ]);
  const count = (event: string) => grouped.find((g) => g.event === event)?._count._all ?? 0;

  const advancesByStep = await db.formV2Analytics.groupBy({
    by: ["stepId"],
    where: { formId, event: "STEP_ADVANCE" },
    _count: { _all: true },
  });
  const advanceMap = new Map<string | null, number>();
  for (const row of advancesByStep) advanceMap.set(row.stepId, row._count._all);

  const views = count("VIEW");
  const submitSuccess = count("SUBMIT_SUCCESS");

  return {
    views,
    submitAttempts: count("SUBMIT_ATTEMPT"),
    submitSuccess,
    paymentSuccess: count("PAYMENT_SUCCESS"),
    conversionRate: views > 0 ? submitSuccess / views : 0,
    stepFunnel: steps.map((s) => ({
      stepId: s.id,
      title: s.title,
      order: s.order,
      advances: advanceMap.get(s.id) ?? 0,
    })),
  };
}
