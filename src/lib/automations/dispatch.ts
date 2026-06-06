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
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { setEntityTags } from "@/app/app/(crm)/settings/tags/actions";
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
    case "SEND_EMAIL_PLACEHOLDER": {
      const to = renderTemplate(String(cfg.to ?? ""), ctx.record);
      const subject = renderTemplate(String(cfg.subject ?? ""), ctx.record);
      return { result: { kind: action.kind, status: "done", detail: `Sent (stub) to ${to || "?"}: ${subject}` } };
    }
    case "WAIT": {
      const minutes = Number(cfg.minutes ?? 0);
      return { result: { kind: action.kind, status: "done", detail: `wait ${minutes}m` }, pause: { resumeMinutes: minutes } };
    }
    default:
      return { result: { kind: String(action.kind), status: "skipped", detail: "unknown action" } };
  }
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
export async function dispatchAutomation(event: AutomationEvent): Promise<void> {
  try {
    const { db } = getTenantDb();
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
