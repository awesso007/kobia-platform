/*
 * Automation dispatcher (server-only). dispatchAutomation(event) is called from
 * every CRM CRUD server action AFTER the DB write and auditWrite. It matches
 * enabled, non-deleted automations by trigger + entityType, evaluates their
 * condition group against a flat snapshot of the record, then executes the
 * action sequence in order, recording one AutomationRun row per automation.
 *
 * WAIT actions stop the sequence and enqueue an AutomationQueue row with the
 * remaining actions; /api/cron/automations resumes them when resumeAt passes.
 *
 * Dispatch never throws into the caller: a failing automation is logged and
 * recorded as a FAILED run, but the originating CRUD action still succeeds.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { randomBytes } from "crypto";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { setEntityTags } from "@/app/app/(crm)/settings/tags/actions";
import { notifyOn } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/send";
import type { EmailRecordType } from "@/lib/email/link";
import { sendAndRecordSms } from "@/lib/telephony/sms";
import { attachFile, type FileEntity } from "@/lib/files/files";
import {
  evaluateConditions,
  renderTemplate,
  type AutomationAction,
  type AutomationEvent,
  type ConditionGroup,
} from "./types";

type Db = ReturnType<typeof getTenantDb>["db"];

const FK_BY_ENTITY: Record<string, "leadId" | "dealId" | "contactId" | "companyId" | null> = {
  LEAD: "leadId",
  DEAL: "dealId",
  CONTACT: "contactId",
  COMPANY: "companyId",
  ACTIVITY: null,
};

/** Build a flat string-keyed snapshot of a record for condition + template use. */
async function loadRecordSnapshot(
  db: Db,
  entityType: string,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  switch (entityType) {
    case "LEAD":
      return (await db.lead.findUnique({ where: { id: entityId } })) as Record<string, unknown> | null;
    case "DEAL": {
      const d = await db.deal.findUnique({ where: { id: entityId } });
      return d ? { ...d, amountCents: Number(d.amountCents) } : null;
    }
    case "CONTACT":
      return (await db.contact.findUnique({ where: { id: entityId } })) as Record<string, unknown> | null;
    case "COMPANY":
      return (await db.company.findUnique({ where: { id: entityId } })) as Record<string, unknown> | null;
    case "ACTIVITY":
      return (await db.crmActivity.findUnique({ where: { id: entityId } })) as Record<string, unknown> | null;
    default:
      return null;
  }
}

type ActionResult = { kind: string; status: "done" | "skipped"; detail?: string };

/**
 * Execute one action against the trigger record. Returns the result entry and a
 * boolean signalling whether the sequence should pause (WAIT).
 */
async function runAction(
  db: Db,
  action: AutomationAction,
  ctx: { entityType: string; entityId: string; record: Record<string, unknown> },
): Promise<{ result: ActionResult; pause?: { resumeMinutes: number } }> {
  const cfg = action.config ?? {};
  const fk = FK_BY_ENTITY[ctx.entityType];

  switch (action.kind) {
    case "CREATE_ACTIVITY": {
      const subject = renderTemplate(String(cfg.subject ?? "Automated task"), ctx.record).trim() || "Automated task";
      const type = String(cfg.activityType ?? "TASK");
      const offsetDays = Number(cfg.dueOffsetDays ?? 1);
      const dueAt = new Date(Date.now() + offsetDays * 86_400_000);
      await db.crmActivity.create({
        data: {
          type: type as never,
          subject,
          body: cfg.body ? renderTemplate(String(cfg.body), ctx.record) : null,
          dueAt,
          ...(fk ? { [fk]: ctx.entityId } : {}),
        },
      });
      return { result: { kind: action.kind, status: "done", detail: subject } };
    }
    case "UPDATE_FIELD": {
      const field = String(cfg.field ?? "");
      if (!field) return { result: { kind: action.kind, status: "skipped", detail: "no field" } };
      const value = renderTemplate(String(cfg.value ?? ""), ctx.record);
      const model = modelFor(db, ctx.entityType);
      if (!model) return { result: { kind: action.kind, status: "skipped", detail: "unsupported entity" } };
      await model.update({ where: { id: ctx.entityId }, data: { [field]: value } });
      return { result: { kind: action.kind, status: "done", detail: `${field}=${value}` } };
    }
    case "CREATE_RECORD": {
      const target = String(cfg.target ?? "");
      const name = renderTemplate(String(cfg.name ?? ""), ctx.record).trim();
      if (target === "LEAD" && name) {
        await db.lead.create({ data: { name } });
      } else if (target === "CONTACT" && name) {
        await db.contact.create({ data: { firstName: name } });
      } else if (target === "COMPANY" && name) {
        await db.company.create({ data: { name } });
      } else {
        return { result: { kind: action.kind, status: "skipped", detail: "missing target/name" } };
      }
      return { result: { kind: action.kind, status: "done", detail: `${target}:${name}` } };
    }
    case "ADD_TAG":
    case "REMOVE_TAG": {
      const tagId = String(cfg.tagId ?? "");
      if (!tagId || !FK_BY_ENTITY[ctx.entityType]) {
        return { result: { kind: action.kind, status: "skipped", detail: "no tag/entity" } };
      }
      const existing = await db.tagAssignment.findMany({
        where: { entityType: ctx.entityType as never, entityId: ctx.entityId },
        select: { tagId: true },
      });
      const current = new Set(existing.map((e) => e.tagId));
      if (action.kind === "ADD_TAG") current.add(tagId);
      else current.delete(tagId);
      await setEntityTags({ entityType: ctx.entityType, entityId: ctx.entityId, tagIds: Array.from(current) });
      return { result: { kind: action.kind, status: "done", detail: tagId } };
    }
    case "ASSIGN_OWNER": {
      const owner = String(cfg.ownerUserId ?? "");
      const model = modelFor(db, ctx.entityType);
      if (!owner || !model) return { result: { kind: action.kind, status: "skipped", detail: "no owner/entity" } };
      await model.update({ where: { id: ctx.entityId }, data: { ownerUserId: owner } });
      return { result: { kind: action.kind, status: "done", detail: owner } };
    }
    case "SEND_EMAIL": {
      const accountId = String(cfg.accountId ?? "");
      if (!accountId) return { result: { kind: action.kind, status: "skipped", detail: "no account" } };

      // Recipient: a token (trigger.contact.email / trigger.owner.email) or a
      // literal/template address resolved against the trigger record.
      const toRaw = String(cfg.to ?? "");
      let to = "";
      if (toRaw === "trigger.contact.email") {
        to = String(ctx.record.email ?? "");
      } else if (toRaw === "trigger.owner.email") {
        const ownerId = String(ctx.record.ownerUserId ?? ctx.record.ownerClerkUserId ?? "");
        if (ownerId) {
          const member = await db.membership.findUnique({ where: { clerkUserId: ownerId } });
          to = member?.email ?? "";
        }
      } else {
        to = renderTemplate(toRaw, ctx.record).trim();
      }
      if (!to) return { result: { kind: action.kind, status: "skipped", detail: "no recipient" } };

      let subject = "";
      let html = "";
      const templateId = String(cfg.templateId ?? "");
      if (templateId) {
        const tpl = await db.emailTemplate.findUnique({ where: { id: templateId } });
        if (!tpl) return { result: { kind: action.kind, status: "skipped", detail: "template not found" } };
        subject = renderTemplate(tpl.subject, ctx.record);
        html = renderTemplate(tpl.bodyHtml, ctx.record);
      } else {
        subject = renderTemplate(String(cfg.subject ?? ""), ctx.record);
        html = renderTemplate(String(cfg.html ?? cfg.body ?? ""), ctx.record);
      }

      const res = await sendEmail(
        {
          accountId,
          to: [to],
          subject,
          html,
          recordType: ctx.entityType as EmailRecordType,
          recordId: ctx.entityId,
        },
        db,
      );
      if (!res.ok) return { result: { kind: action.kind, status: "skipped", detail: res.error ?? "send failed" } };
      return { result: { kind: action.kind, status: "done", detail: `Sent to ${to}: ${subject}` } };
    }
    case "SEND_SMS": {
      const fromPhoneNumberId = String(cfg.fromPhoneNumberId ?? "");
      if (!fromPhoneNumberId) return { result: { kind: action.kind, status: "skipped", detail: "no from number" } };
      const number = await db.phoneNumber.findUnique({ where: { id: fromPhoneNumberId } });
      if (!number) return { result: { kind: action.kind, status: "skipped", detail: "from number not found" } };

      // Recipient: a token resolving to the trigger record's phone, or a template.
      const toRaw = String(cfg.to ?? "");
      let to = "";
      if (toRaw === "trigger.contact.phone" || toRaw === "trigger.lead.phone") {
        to = String(ctx.record.phone ?? "");
      } else {
        to = renderTemplate(toRaw, ctx.record).trim();
      }
      if (!to) return { result: { kind: action.kind, status: "skipped", detail: "no recipient" } };

      const body = renderTemplate(String(cfg.body ?? ""), ctx.record);
      if (!body.trim()) return { result: { kind: action.kind, status: "skipped", detail: "empty body" } };

      const link =
        ctx.entityType === "CONTACT"
          ? { contactId: ctx.entityId }
          : ctx.entityType === "LEAD"
            ? { leadId: ctx.entityId }
            : {};
      const res = await sendAndRecordSms({ fromE164: number.e164, toE164: to, body, ...link }, db);
      if (!res.ok) return { result: { kind: action.kind, status: "skipped", detail: res.error ?? "send failed" } };
      return { result: { kind: action.kind, status: "done", detail: `SMS to ${to}` } };
    }
    case "MAKE_CALL": {
      // Stub: logs intent and creates a Task activity reminding the owner to call.
      const to = String(cfg.to ?? ctx.record.phone ?? "");
      const subject = renderTemplate(String(cfg.subject ?? `Call ${to || "contact"}`), ctx.record).trim() || "Make a call";
      await db.crmActivity.create({
        data: {
          type: "TASK" as never,
          subject,
          body: to ? `Reminder to call ${to}.` : null,
          dueAt: new Date(Date.now() + 86_400_000),
          ...(fk ? { [fk]: ctx.entityId } : {}),
        },
      });
      return { result: { kind: action.kind, status: "done", detail: `Task: ${subject}` } };
    }
    case "ATTACH_FILE": {
      const fileId = String(cfg.fileId ?? "");
      if (!fileId) return { result: { kind: action.kind, status: "skipped", detail: "no file" } };
      // entityType/entityId default to the trigger record (the "trigger.record"
      // / "trigger.id" tokens); a literal entityType/entityId may override.
      const targetType = (cfg.entityType && cfg.entityType !== "trigger.record"
        ? String(cfg.entityType)
        : ctx.entityType) as FileEntity;
      const targetId = cfg.entityId && cfg.entityId !== "trigger.id" ? String(cfg.entityId) : ctx.entityId;
      const file = await db.file.findUnique({ where: { id: fileId } });
      if (!file || file.status === "DELETED") {
        return { result: { kind: action.kind, status: "skipped", detail: "file not found" } };
      }
      await attachFile(db, { fileId, entityType: targetType, entityId: targetId });
      return { result: { kind: action.kind, status: "done", detail: `attached ${file.name}` } };
    }
    case "CREATE_QUOTE": {
      // Only meaningful for a DEAL trigger - the quote is built from the deal's
      // line items. Skips silently for other entity types.
      if (ctx.entityType !== "DEAL") return { result: { kind: action.kind, status: "skipped", detail: "deal trigger required" } };
      const quoteId = await createQuoteFromDeal(db, ctx.entityId, {
        templateId: cfg.templateId ? String(cfg.templateId) : null,
        send: false,
      });
      if (!quoteId) return { result: { kind: action.kind, status: "skipped", detail: "deal not found" } };
      return { result: { kind: action.kind, status: "done", detail: quoteId } };
    }
    case "SEND_QUOTE": {
      if (ctx.entityType !== "DEAL") return { result: { kind: action.kind, status: "skipped", detail: "deal trigger required" } };
      const quoteId = await createQuoteFromDeal(db, ctx.entityId, {
        templateId: cfg.templateId ? String(cfg.templateId) : null,
        send: true,
      });
      if (!quoteId) return { result: { kind: action.kind, status: "skipped", detail: "deal not found" } };
      return { result: { kind: action.kind, status: "done", detail: `sent ${quoteId}` } };
    }
    case "WAIT": {
      const minutes = Number(cfg.minutes ?? 0);
      return { result: { kind: action.kind, status: "done", detail: `wait ${minutes}m` }, pause: { resumeMinutes: minutes } };
    }
    default:
      return { result: { kind: String(action.kind), status: "skipped", detail: "unknown action" } };
  }
}

/** Allocate the next quote number for the current month: Q-YYYYMM-NNNN. */
async function nextQuoteNumber(db: Db): Promise<string> {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `Q-${ym}-`;
  const last = await db.quote.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let n = 1;
  if (last) {
    const tail = Number(last.number.slice(prefix.length));
    if (Number.isFinite(tail)) n = tail + 1;
  }
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * Create a quote from a deal's line items (used by the CREATE_QUOTE / SEND_QUOTE
 * automation actions). When `send` is true, also generates+stores the PDF, marks
 * it SENT, and notifies the deal owner. Returns the new quote id, or null if the
 * deal does not exist. Runs entirely on the injected db (no request scope).
 */
async function createQuoteFromDeal(
  db: Db,
  dealId: string,
  opts: { templateId: string | null; send: boolean },
): Promise<string | null> {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (!deal) return null;

  const template = opts.templateId
    ? await db.quoteTemplate.findUnique({ where: { id: opts.templateId } })
    : await db.quoteTemplate.findFirst({ orderBy: { createdAt: "asc" } });

  const quote = await db.quote.create({
    data: {
      number: await nextQuoteNumber(db),
      title: `Quote for ${deal.name}`,
      dealId: deal.id,
      contactId: deal.contactId,
      templateId: template?.id ?? null,
      status: "DRAFT",
      publicSlug: randomBytes(12).toString("base64url"),
      notes: template?.defaultNotes ?? null,
      termsAndConditions: template?.defaultTerms ?? null,
      ownerClerkUserId: deal.ownerUserId ?? null,
    },
  });

  if (deal.lineItems.length > 0) {
    await db.quoteLineItem.createMany({
      data: deal.lineItems.map((l, idx) => ({
        quoteId: quote.id,
        productId: l.productId,
        name: l.name,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        discountPct: l.discountPct,
        taxRatePct: l.taxRatePct,
        sortOrder: idx,
      })),
    });
    // Recompute stored totals from the line items.
    const items = await db.quoteLineItem.findMany({ where: { quoteId: quote.id } });
    let subtotal = 0, discount = 0, tax = 0;
    for (const i of items) {
      const gross = Number(i.quantity) * i.unitPriceCents;
      const disc = gross * (Number(i.discountPct) / 100);
      const net = gross - disc;
      tax += net * (Number(i.taxRatePct) / 100);
      subtotal += gross; discount += disc;
    }
    await db.quote.update({
      where: { id: quote.id },
      data: {
        subtotalCents: Math.round(subtotal),
        discountCents: Math.round(discount),
        taxCents: Math.round(tax),
        totalCents: Math.round(subtotal - discount + tax),
      },
    });
  }

  if (opts.send) {
    try {
      const { generateAndStoreQuotePdf } = await import("@/app/app/(crm)/quotes/pdf");
      await generateAndStoreQuotePdf(quote.id);
    } catch {
      // PDF generation is best-effort.
    }
    await db.quote.update({ where: { id: quote.id }, data: { status: "SENT", sentAt: new Date() } });
    if (quote.ownerClerkUserId) {
      await notifyOn(db, quote.ownerClerkUserId, { type: "SYSTEM", title: `Quote ${quote.number} sent`, linkUrl: `/app/quotes/${quote.id}` });
    }
  }

  return quote.id;
}

type UpdatableModel = {
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
};

function modelFor(db: Db, entityType: string): UpdatableModel | null {
  switch (entityType) {
    case "LEAD":
      return db.lead as unknown as UpdatableModel;
    case "DEAL":
      return db.deal as unknown as UpdatableModel;
    case "CONTACT":
      return db.contact as unknown as UpdatableModel;
    case "COMPANY":
      return db.company as unknown as UpdatableModel;
    default:
      return null;
  }
}

/**
 * Run a sequence of actions, recording results. If a WAIT is hit, the remaining
 * actions (after the WAIT) are enqueued and execution pauses. Returns the
 * executed-action log and whether the run paused.
 */
async function executeSequence(
  db: Db,
  runId: string,
  actions: AutomationAction[],
  ctx: { entityType: string; entityId: string; record: Record<string, unknown> },
  startIndex = 0,
): Promise<{ executed: ActionResult[]; paused: boolean }> {
  const executed: ActionResult[] = [];
  for (let i = startIndex; i < actions.length; i++) {
    const { result, pause } = await runAction(db, actions[i]!, ctx);
    executed.push(result);
    if (pause) {
      await db.automationQueue.create({
        data: {
          automationRunId: runId,
          resumeAt: new Date(Date.now() + pause.resumeMinutes * 60_000),
          payload: { entityType: ctx.entityType, entityId: ctx.entityId, resumeIndex: i + 1 } as never,
          status: "PENDING",
        },
      });
      return { executed, paused: true };
    }
  }
  return { executed, paused: false };
}

/**
 * Match and run all enabled automations for an event. Safe to call from any
 * CRUD action; swallows its own errors.
 */
export async function dispatchAutomation(event: AutomationEvent, injectedDb?: Db): Promise<void> {
  try {
    const db = injectedDb ?? getTenantDb().db;
    const automations = await db.automation.findMany({
      where: {
        enabled: true,
        deletedAt: null,
        triggerType: event.type as never,
        entityType: event.entityType as never,
      },
    });
    if (automations.length === 0) return;

    const record = event.record ?? (await loadRecordSnapshot(db, event.entityType, event.entityId)) ?? {};

    for (const automation of automations) {
      // FIELD_CHANGED / RECORD_UPDATED can narrow by watched fields.
      if (event.changedFields && event.changedFields.length > 0) {
        const cfg = (automation.triggerConfig ?? {}) as { field?: string; watchFields?: string[] };
        const watch = automation.triggerType === "FIELD_CHANGED" ? (cfg.field ? [cfg.field] : []) : cfg.watchFields ?? [];
        if (watch.length > 0 && !watch.some((f) => event.changedFields!.includes(f))) continue;
      }

      const conditions = automation.conditions as ConditionGroup | null;
      if (!evaluateConditions(conditions, record)) {
        await db.automationRun.create({
          data: {
            automationId: automation.id,
            entityType: event.entityType as never,
            entityId: event.entityId,
            status: "SKIPPED",
            finishedAt: new Date(),
            actionsExecuted: [] as never,
          },
        });
        continue;
      }

      const run = await db.automationRun.create({
        data: {
          automationId: automation.id,
          entityType: event.entityType as never,
          entityId: event.entityId,
          status: "SUCCESS",
        },
      });
      try {
        const actions = (automation.actions ?? []) as AutomationAction[];
        const { executed } = await executeSequence(db, run.id, actions, {
          entityType: event.entityType,
          entityId: event.entityId,
          record,
        });
        await db.automationRun.update({
          where: { id: run.id },
          data: { status: "SUCCESS", finishedAt: new Date(), actionsExecuted: executed as never },
        });
      } catch (err) {
        await db.automationRun.update({
          where: { id: run.id },
          data: { status: "FAILED", finishedAt: new Date(), error: String(err instanceof Error ? err.message : err) },
        });
        if (automation.createdByClerkUserId) {
          await notifyOn(db, automation.createdByClerkUserId, {
            type: "AUTOMATION_RESULT",
            title: `Automation "${automation.name}" failed`,
            body: String(err instanceof Error ? err.message : err),
            linkUrl: "/app/automations",
          });
        }
      }
    }
  } catch (err) {
    console.error("[dispatchAutomation] failed", err);
  }
}

/**
 * Resume queued WAIT continuations whose resumeAt has passed. Used by cron. The
 * caller may inject a schema-bound client (the cron route binds per tenant);
 * otherwise the request-scoped tenant db is used.
 */
export async function processAutomationQueue(injectedDb?: Db): Promise<{ processed: number }> {
  const db = injectedDb ?? getTenantDb().db;
  const due = await db.automationQueue.findMany({
    where: { status: "PENDING", resumeAt: { lte: new Date() } },
    take: 50,
    include: { automationRun: { include: { automation: true } } },
  });

  let processed = 0;
  for (const item of due) {
    const payload = (item.payload ?? {}) as { entityType?: string; entityId?: string; resumeIndex?: number };
    const automation = item.automationRun.automation;
    try {
      const entityType = payload.entityType ?? item.automationRun.entityType;
      const entityId = payload.entityId ?? item.automationRun.entityId ?? "";
      const record = (await loadRecordSnapshot(db, entityType, entityId)) ?? {};
      const actions = (automation.actions ?? []) as AutomationAction[];
      const { executed } = await executeSequence(db, item.automationRunId, actions, { entityType, entityId, record }, payload.resumeIndex ?? 0);
      const prior = (item.automationRun.actionsExecuted ?? []) as ActionResult[];
      await db.automationRun.update({
        where: { id: item.automationRunId },
        data: { actionsExecuted: [...prior, ...executed] as never, finishedAt: new Date() },
      });
      await db.automationQueue.update({ where: { id: item.id }, data: { status: "DONE" } });
      processed++;
    } catch (err) {
      await db.automationQueue.update({ where: { id: item.id }, data: { status: "FAILED" } });
      console.error("[processAutomationQueue] item failed", item.id, err);
    }
  }
  return { processed };
}

/**
 * Daily scan for rotting deals. A deal is rotting when it has sat in its current
 * stage longer than the stage's rotting_days threshold. We use the deal's
 * updatedAt as a proxy for "time in stage" (it bumps on every stage move). For
 * each rotting OPEN deal we dispatch a STAGE_TIME_EXCEEDED event so any matching
 * automations run. Returns the count of deals flagged. Cron-safe (injected db).
 */
export async function scanRottingDeals(injectedDb?: Db): Promise<{ rotting: number }> {
  const db = injectedDb ?? getTenantDb().db;
  const stages = await db.dealStage.findMany({ where: { rotting_days: { not: null } }, select: { id: true, rotting_days: true } });
  if (stages.length === 0) return { rotting: 0 };

  const now = Date.now();
  let rotting = 0;
  for (const stage of stages) {
    const days = stage.rotting_days ?? 0;
    if (days <= 0) continue;
    const cutoff = new Date(now - days * 86_400_000);
    const deals = await db.deal.findMany({
      where: { stageId: stage.id, status: "OPEN", updatedAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const deal of deals) {
      rotting++;
      await dispatchAutomation({ type: "STAGE_TIME_EXCEEDED", entityType: "DEAL", entityId: deal.id, changedFields: ["stageId"] }, db);
    }
  }
  return { rotting };
}
