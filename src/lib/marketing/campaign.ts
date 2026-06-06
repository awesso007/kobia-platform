/*
 * Drip campaign runner (Sprint 13, server-only). A Campaign has an ordered list
 * of CampaignSteps; each enrolled contact/lead walks them via a CampaignEnrollment
 * whose nextRunAt gates the next step. /api/cron/campaign-runner picks up ACTIVE
 * enrollments with nextRunAt <= now and calls runEnrollmentStep, which:
 *
 *   EMAIL/SMS  - send to the enrollee, advance immediately
 *   WAIT       - set nextRunAt = now + days/hours, stay on the next step
 *   CONDITION  - evaluate field/op/value against the enrollee snapshot; on false,
 *                complete the enrollment (simple linear branch for the alpha)
 *   TAG        - assign a tag to the enrollee
 *   WEBHOOK    - best-effort POST to config.url
 *
 * enrollContacts seeds enrollments for a campaign (used by the MANUAL activate
 * path and the ENROLL_IN_CAMPAIGN automation action).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { sendEmail } from "@/lib/email/send";
import { sendAndRecordSms } from "@/lib/telephony/sms";
import { evaluateConditions } from "@/lib/automations/types";

type Db = PrismaClient;

type Enrollee = { entityType: "contact" | "lead"; id: string; email: string | null; phone: string | null; record: Record<string, unknown> };

async function loadEnrollee(db: Db, enrollment: { contactId: string | null; leadId: string | null }): Promise<Enrollee | null> {
  if (enrollment.contactId) {
    const c = await db.contact.findUnique({ where: { id: enrollment.contactId } });
    if (!c) return null;
    return { entityType: "contact", id: c.id, email: c.email ?? null, phone: c.phone ?? null, record: c as Record<string, unknown> };
  }
  if (enrollment.leadId) {
    const l = await db.lead.findUnique({ where: { id: enrollment.leadId } });
    if (!l) return null;
    return { entityType: "lead", id: l.id, email: l.email ?? null, phone: l.phone ?? null, record: l as Record<string, unknown> };
  }
  return null;
}

/** Enroll a set of contacts or leads into a campaign at its first step. */
export async function enrollContacts(
  db: Db,
  campaignId: string,
  entities: { entityType: "contact" | "lead"; id: string }[],
): Promise<number> {
  const firstStep = await db.campaignStep.findFirst({ where: { campaignId }, orderBy: { order: "asc" } });
  let created = 0;
  for (const e of entities) {
    const existing = await db.campaignEnrollment.findFirst({
      where: {
        campaignId,
        contactId: e.entityType === "contact" ? e.id : undefined,
        leadId: e.entityType === "lead" ? e.id : undefined,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (existing) continue;
    await db.campaignEnrollment.create({
      data: {
        campaignId,
        contactId: e.entityType === "contact" ? e.id : null,
        leadId: e.entityType === "lead" ? e.id : null,
        currentStepId: firstStep?.id ?? null,
        status: firstStep ? "ACTIVE" : "COMPLETED",
        nextRunAt: firstStep ? new Date() : null,
      },
    });
    created++;
  }
  return created;
}

export type StepResult = { action: string; status: "done" | "skipped" | "completed"; detail?: string };

/** Execute the enrollment's current step and advance (or complete) it. */
export async function runEnrollmentStep(db: Db, enrollmentId: string): Promise<StepResult> {
  const enrollment = await db.campaignEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.status !== "ACTIVE") return { action: "none", status: "skipped", detail: "not active" };
  if (!enrollment.currentStepId) {
    await completeEnrollment(db, enrollmentId);
    return { action: "none", status: "completed", detail: "no current step" };
  }

  const step = await db.campaignStep.findUnique({ where: { id: enrollment.currentStepId } });
  if (!step) {
    await completeEnrollment(db, enrollmentId);
    return { action: "none", status: "completed", detail: "step gone" };
  }

  const enrollee = await loadEnrollee(db, enrollment);
  if (!enrollee) {
    await db.campaignEnrollment.update({ where: { id: enrollmentId }, data: { status: "FAILED", nextRunAt: null } });
    return { action: step.type, status: "skipped", detail: "enrollee gone" };
  }

  const cfg = (step.config ?? {}) as Record<string, unknown>;

  if (step.type === "WAIT") {
    const days = Number(cfg.days ?? 0);
    const hours = Number(cfg.hours ?? 0);
    const resumeMs = (days * 24 + hours) * 60 * 60 * 1000;
    await advance(db, enrollment, step, new Date(Date.now() + resumeMs));
    return { action: "WAIT", status: "done", detail: `wait ${days}d ${hours}h` };
  }

  if (step.type === "CONDITION") {
    const group = { combinator: "AND" as const, rows: [{ field: String(cfg.field ?? ""), operator: (cfg.op ?? "eq") as never, value: cfg.value == null ? undefined : String(cfg.value) }] };
    const pass = evaluateConditions(group, enrollee.record);
    if (!pass) {
      await completeEnrollment(db, enrollmentId);
      return { action: "CONDITION", status: "completed", detail: "condition false" };
    }
    await advance(db, enrollment, step, new Date());
    return { action: "CONDITION", status: "done", detail: "condition true" };
  }

  if (step.type === "EMAIL") {
    const account = await db.emailAccount.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
    if (account && enrollee.email) {
      await sendEmail(
        { accountId: account.id, to: [enrollee.email], subject: String(cfg.subject ?? "A message for you"), html: String(cfg.body ?? "") },
        db,
      ).catch(() => undefined);
    }
    await advance(db, enrollment, step, new Date());
    return { action: "EMAIL", status: "done" };
  }

  if (step.type === "SMS") {
    const num = await db.phoneNumber.findFirst({ where: { status: "ACTIVE" }, select: { e164: true } });
    if (num?.e164 && enrollee.phone) {
      await sendAndRecordSms(
        { fromE164: num.e164, toE164: enrollee.phone, body: String(cfg.body ?? ""), contactId: enrollment.contactId, leadId: enrollment.leadId },
        db,
      ).catch(() => undefined);
    }
    await advance(db, enrollment, step, new Date());
    return { action: "SMS", status: "done" };
  }

  if (step.type === "TAG") {
    const tagId = String(cfg.tagId ?? "");
    if (tagId) {
      await db.tagAssignment
        .create({ data: { tagId, entityType: enrollee.entityType === "contact" ? "CONTACT" : "LEAD", entityId: enrollee.id } })
        .catch(() => undefined);
    }
    await advance(db, enrollment, step, new Date());
    return { action: "TAG", status: "done" };
  }

  if (step.type === "WEBHOOK") {
    const url = String(cfg.url ?? "");
    if (url) {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType: enrollee.entityType, id: enrollee.id, email: enrollee.email }),
      }).catch(() => undefined);
    }
    await advance(db, enrollment, step, new Date());
    return { action: "WEBHOOK", status: "done" };
  }

  await advance(db, enrollment, step, new Date());
  return { action: step.type, status: "skipped", detail: "unknown step type" };
}

/** Move the enrollment to the next step by order, or complete it if none remain. */
async function advance(
  db: Db,
  enrollment: { id: string; campaignId: string },
  step: { order: number },
  nextRunAt: Date,
): Promise<void> {
  const next = await db.campaignStep.findFirst({
    where: { campaignId: enrollment.campaignId, order: { gt: step.order } },
    orderBy: { order: "asc" },
  });
  if (!next) {
    await completeEnrollment(db, enrollment.id);
    return;
  }
  await db.campaignEnrollment.update({
    where: { id: enrollment.id },
    data: { currentStepId: next.id, lastStepAt: new Date(), nextRunAt },
  });
}

async function completeEnrollment(db: Db, enrollmentId: string): Promise<void> {
  await db.campaignEnrollment.update({
    where: { id: enrollmentId },
    data: { status: "COMPLETED", nextRunAt: null, lastStepAt: new Date() },
  });
}
