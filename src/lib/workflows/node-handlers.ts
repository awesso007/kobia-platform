/*
 * Workflow node handlers (Sprint 18, server-only). Each handler executes one
 * action node against the injected tenant db and returns a structured output
 * that is written to a WorkflowStepLog. Handlers are best-effort: a handler that
 * cannot fully complete (e.g. no email account configured) records what it
 * would have done rather than throwing, so a single mis-configured node does not
 * abort the whole run. Logic nodes (condition/delay/branch/parallel/end) are
 * handled by the runner, not here.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { notifyOn } from "@/lib/notifications/notify";
import { renderTemplate, type WorkflowNode } from "./workflow-utils";

type Db = PrismaClient;

export type StepContext = Record<string, unknown>;

export type HandlerResult = {
  output: Record<string, unknown>;
  /** Optional patch merged into the run context for downstream nodes. */
  contextPatch?: Record<string, unknown>;
};

const ENTITY_DELEGATE: Record<string, "lead" | "deal" | "contact" | "company"> = {
  LEAD: "lead",
  DEAL: "deal",
  CONTACT: "contact",
  COMPANY: "company",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function tpl(v: unknown, ctx: StepContext): string {
  return renderTemplate(str(v), ctx);
}

function parseJsonObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  return {};
}

/**
 * Execute an action node. The `nodeType` is the effective data.type. Returns the
 * structured output for the step log. Throws only on truly unexpected errors;
 * expected "cannot do this in this context" situations are returned as output
 * with `skipped: true`.
 */
export async function runActionNode(
  db: Db,
  node: WorkflowNode,
  nodeType: string,
  ctx: StepContext,
): Promise<HandlerResult> {
  const data = node.data ?? {};
  switch (nodeType) {
    case "action.send_email": {
      const to = tpl(data.to, ctx);
      const subject = tpl(data.subject, ctx);
      const body = tpl(data.body, ctx);
      const account = await db.emailAccount.findFirst({ where: { status: "ACTIVE" } }).catch(() => null);
      if (!account) {
        return { output: { skipped: true, reason: "no active email account", to, subject } };
      }
      const { sendEmail } = await import("@/lib/email/send");
      const res = await sendEmail(
        { accountId: account.id, to: [to], subject, html: body, text: body },
        db,
      ).catch((err) => ({ ok: false, error: String(err instanceof Error ? err.message : err) }));
      return { output: { to, subject, sent: res.ok, ...(("error" in res && res.error) ? { error: res.error } : {}) } };
    }

    case "action.send_sms": {
      const to = tpl(data.to, ctx);
      const body = tpl(data.body, ctx);
      const number = await db.phoneNumber.findFirst({ where: { status: "ACTIVE" } }).catch(() => null);
      if (!number) {
        return { output: { skipped: true, reason: "no active phone number", to, body } };
      }
      const { sendAndRecordSms } = await import("@/lib/telephony/sms");
      const res = await sendAndRecordSms(
        { fromE164: number.e164, toE164: to, body },
        db,
      ).catch((err) => ({ ok: false, error: String(err instanceof Error ? err.message : err) }));
      return { output: { to, sent: "ok" in res ? res.ok : false } };
    }

    case "action.create_task": {
      const title = tpl(data.title, ctx) || "Workflow task";
      const assigneeId = str(data.assigneeId) || null;
      const dueInDays = Number(data.dueInDays);
      const dueAt =
        Number.isFinite(dueInDays) && dueInDays > 0
          ? new Date(Date.now() + dueInDays * 86_400_000)
          : null;
      const task = await db.task.create({
        data: {
          title,
          status: "TODO" as never,
          assigneeClerkUserId: assigneeId,
          dueAt,
        },
      });
      return { output: { taskId: task.id, title }, contextPatch: { lastTaskId: task.id } };
    }

    case "action.create_deal": {
      const name = tpl(data.name, ctx) || "Workflow deal";
      const amount = Number(data.amount);
      const pipelineId = str(data.pipelineId) || null;
      const stageId = str(data.stageId) || null;
      const resolvedPipelineId =
        pipelineId ?? (await db.pipeline.findFirst({ where: { entityType: "DEAL" } }).catch(() => null))?.id ?? null;
      const resolvedStageId =
        stageId ??
        (resolvedPipelineId
          ? (await db.dealStage.findFirst({ where: { pipelineId: resolvedPipelineId }, orderBy: { sortOrder: "asc" } }).catch(() => null))?.id
          : null) ??
        null;
      if (!resolvedPipelineId || !resolvedStageId) {
        return { output: { skipped: true, reason: "no pipeline/stage available", name } };
      }
      const cents = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
      const deal = await db.deal.create({
        data: {
          name,
          amountCents: BigInt(cents),
          pipelineId: resolvedPipelineId,
          stageId: resolvedStageId,
        },
      });
      return { output: { dealId: deal.id, name }, contextPatch: { lastDealId: deal.id } };
    }

    case "action.update_record": {
      const entity = str(data.entity).toUpperCase();
      const delegate = ENTITY_DELEGATE[entity];
      const recordId = tpl(data.recordId, ctx) || str(ctx.entityId);
      const fields = parseJsonObject(data.fields);
      if (!delegate || !recordId || Object.keys(fields).length === 0) {
        return { output: { skipped: true, reason: "missing entity/recordId/fields" } };
      }
      await (db[delegate] as { update: (a: unknown) => Promise<unknown> }).update({
        where: { id: recordId },
        data: fields,
      });
      return { output: { entity, recordId, fields } };
    }

    case "action.add_tag":
    case "action.remove_tag": {
      const entity = str(data.entity).toUpperCase();
      const recordId = tpl(data.recordId, ctx) || str(ctx.entityId);
      const tagName = tpl(data.tag, ctx);
      if (!entity || !recordId || !tagName) {
        return { output: { skipped: true, reason: "missing entity/recordId/tag" } };
      }
      const tag = await db.tag.findFirst({ where: { name: tagName } }).catch(() => null);
      if (!tag) {
        if (nodeType === "action.remove_tag") return { output: { skipped: true, reason: "tag not found", tag: tagName } };
        const created = await db.tag.create({ data: { name: tagName, color: "#6366f1" } }).catch(() => null);
        if (!created) return { output: { skipped: true, reason: "could not create tag", tag: tagName } };
        await db.tagAssignment
          .create({ data: { tagId: created.id, entityType: entity as never, entityId: recordId } })
          .catch(() => undefined);
        return { output: { added: tagName, recordId } };
      }
      if (nodeType === "action.add_tag") {
        await db.tagAssignment
          .create({ data: { tagId: tag.id, entityType: entity as never, entityId: recordId } })
          .catch(() => undefined);
        return { output: { added: tagName, recordId } };
      }
      await db.tagAssignment
        .deleteMany({ where: { tagId: tag.id, entityType: entity as never, entityId: recordId } })
        .catch(() => undefined);
      return { output: { removed: tagName, recordId } };
    }

    case "action.http_request":
    case "action.webhook": {
      const method = nodeType === "action.webhook" ? "POST" : (str(data.method) || "GET").toUpperCase();
      const url = tpl(data.url, ctx);
      if (!url || !/^https?:\/\//i.test(url)) {
        return { output: { skipped: true, reason: "invalid url", url } };
      }
      const headers = parseJsonObject(data.headers) as Record<string, string>;
      const bodyText = method === "GET" || method === "DELETE" ? undefined : tpl(data.body, ctx);
      try {
        const res = await fetch(url, {
          method,
          headers: { "content-type": "application/json", ...headers },
          body: bodyText && bodyText.length ? bodyText : undefined,
          signal: AbortSignal.timeout(10_000),
        });
        return { output: { url, method, status: res.status, ok: res.ok } };
      } catch (err) {
        return { output: { url, method, ok: false, error: String(err instanceof Error ? err.message : err) } };
      }
    }

    case "action.create_notification": {
      const userId = str(data.userId);
      const message = tpl(data.message, ctx) || "Workflow notification";
      if (!userId) return { output: { skipped: true, reason: "missing userId", message } };
      await notifyOn(db, userId, { type: "SYSTEM", title: message, linkUrl: "/app/workflows" });
      return { output: { userId, message } };
    }

    default:
      return { output: { skipped: true, reason: `unknown action node ${nodeType}` } };
  }
}
