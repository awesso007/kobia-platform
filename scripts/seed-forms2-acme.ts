/*
 * seed-forms2-acme.ts - populate a tenant schema with Sprint 19 Forms 2.0
 * starter data. Idempotent: forms are found by slug; an existing form is left
 * untouched (re-running does not duplicate forms, steps, fields, or
 * submissions).
 *
 * Seeds:
 *   - "Contact Us v2" (slug=contact-us-v2, PUBLISHED)
 *       Step 1 "Your Info": First name*, Last name*, Email*, Phone
 *       Step 2 "Your Need": Service (Accounting/Mortgage/Software),
 *         "Which state?" (visible only when Service = Mortgage),
 *         Message*, "How urgent?" rating 1-5
 *       + 2 sample COMPLETED submissions
 *   - "Consultation Booking" (slug=consult-booking, PUBLISHED) with a $99 payment
 *       Step 1: Name*, Email*
 *       Step 2: Preferred date, Duration (30min/60min)
 *       Step 3: Payment ($99 USD)
 *
 * Usage:
 *   tsx scripts/seed-forms2-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient, type FormFieldType } from "../src/lib/db/generated/tenant";

function fail(msg: string): never {
  console.error(`\n[seed-forms2] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  return slug ?? "acme";
}

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) fail("DIRECT_URL/DATABASE_URL not set");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

type SeedField = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: { label: string; value: string }[];
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentDescription?: string;
  visibilityRule?: unknown;
  helpText?: string;
};

type SeedStep = { title: string; description?: string; fields: SeedField[] };

async function seedForm(
  db: PrismaClient,
  spec: { name: string; slug: string; description: string; steps: SeedStep[] },
): Promise<{ id: string; created: boolean }> {
  const existing = await db.formV2.findUnique({ where: { slug: spec.slug } });
  if (existing) return { id: existing.id, created: false };

  const form = await db.formV2.create({
    data: { name: spec.name, slug: spec.slug, description: spec.description, status: "PUBLISHED" },
  });

  let fieldOrder = 0;
  for (let si = 0; si < spec.steps.length; si++) {
    const s = spec.steps[si]!;
    const step = await db.formStep.create({
      data: { formId: form.id, order: si, title: s.title, description: s.description ?? null },
    });
    for (const f of s.fields) {
      await db.formField.create({
        data: {
          formId: form.id,
          stepId: step.id,
          order: fieldOrder++,
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required ?? false,
          options: (f.options ?? undefined) as never,
          paymentAmount: f.paymentAmount ?? null,
          paymentCurrency: f.paymentCurrency ?? "USD",
          paymentDescription: f.paymentDescription ?? null,
          visibilityRule: (f.visibilityRule ?? undefined) as never,
          helpText: f.helpText ?? null,
        },
      });
    }
  }
  return { id: form.id, created: true };
}

async function ensureSubmissions(db: PrismaClient, formId: string) {
  const count = await db.formV2Submission.count({ where: { formId } });
  if (count >= 2) return 0;
  const samples = [
    { first_name: "Dana", last_name: "Rivera", email: "dana@example.com", phone: "+15551230001", service: "Accounting", message: "Need help with quarterly books.", how_urgent: 3 },
    { first_name: "Sam", last_name: "Okafor", email: "sam@example.com", phone: "+15551230002", service: "Mortgage", which_state: "California", message: "Refinancing questions.", how_urgent: 5 },
  ];
  for (const data of samples) {
    await db.formV2Submission.create({
      data: {
        formId,
        status: "COMPLETED",
        data: data as never,
        meta: { userAgent: "seed", referrer: null, ipHash: null } as never,
      },
    });
    await db.formV2Analytics.create({ data: { formId, event: "SUBMIT_SUCCESS" } });
  }
  return samples.length;
}

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
    console.log(`[seed-forms2] search_path=${schema}`);

    const contact = await seedForm(db, {
      name: "Contact Us v2",
      slug: "contact-us-v2",
      description: "Tell us a bit about yourself and how we can help.",
      steps: [
        {
          title: "Your Info",
          fields: [
            { key: "first_name", label: "First name", type: "SHORT_TEXT", required: true },
            { key: "last_name", label: "Last name", type: "SHORT_TEXT", required: true },
            { key: "email", label: "Email", type: "EMAIL", required: true },
            { key: "phone", label: "Phone", type: "PHONE" },
          ],
        },
        {
          title: "Your Need",
          fields: [
            {
              key: "service",
              label: "Service",
              type: "SELECT",
              required: true,
              options: [
                { label: "Accounting", value: "Accounting" },
                { label: "Mortgage", value: "Mortgage" },
                { label: "Software", value: "Software" },
              ],
            },
            {
              key: "which_state",
              label: "Which state?",
              type: "LONG_TEXT",
              helpText: "Only asked for mortgage inquiries.",
              visibilityRule: { logic: "AND", conditions: [{ field: "service", op: "eq", value: "Mortgage" }] },
            },
            { key: "message", label: "Message", type: "LONG_TEXT", required: true },
            { key: "how_urgent", label: "How urgent?", type: "RATING" },
          ],
        },
      ],
    });
    console.log(`  ok: Contact Us v2 (${contact.id}) created=${contact.created}`);
    const subs = await ensureSubmissions(db, contact.id);
    console.log(`  ok: sample submissions (created ${subs})`);

    const consult = await seedForm(db, {
      name: "Consultation Booking",
      slug: "consult-booking",
      description: "Book a paid consultation with our team.",
      steps: [
        {
          title: "Your Info",
          fields: [
            { key: "name", label: "Name", type: "SHORT_TEXT", required: true },
            { key: "email", label: "Email", type: "EMAIL", required: true },
          ],
        },
        {
          title: "Schedule",
          fields: [
            { key: "preferred_date", label: "Preferred date", type: "DATE", required: true },
            {
              key: "duration",
              label: "Duration",
              type: "SELECT",
              required: true,
              options: [
                { label: "30 min", value: "30min" },
                { label: "60 min", value: "60min" },
              ],
            },
          ],
        },
        {
          title: "Payment",
          fields: [
            {
              key: "payment",
              label: "Consultation fee",
              type: "PAYMENT",
              paymentAmount: 9900,
              paymentCurrency: "USD",
              paymentDescription: "One-time consultation fee.",
            },
          ],
        },
      ],
    });
    console.log(`  ok: Consultation Booking (${consult.id}) created=${consult.created}`);

    const formCount = await db.formV2.count();
    const stepCount = await db.formStep.count();
    const fieldCount = await db.formField.count();
    const subCount = await db.formV2Submission.count();
    console.log(`\n[seed-forms2] done: forms=${formCount} steps=${stepCount} fields=${fieldCount} submissions=${subCount}`);
  } catch (err) {
    fail(String(err instanceof Error ? err.message : err));
  } finally {
    await db.$disconnect();
  }
}

main();
