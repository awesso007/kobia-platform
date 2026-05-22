import { db } from "@/lib/db";
import type { WorkflowTrigger, TaskPriority, ActivityType } from "@prisma/client";

type ActionConfig =
  | {
      type: "CREATE_TASK";
      title: string;
      priority?: TaskPriority;
      dueInDays?: number;
      assigneeUserId?: string;
    }
  | {
      type: "LOG_ACTIVITY";
      activityType?: ActivityType;
      subject: string;
      body?: string;
    }
  | {
      type: "SEND_INTERNAL_NOTE";
      note: string;
    }
  | {
      type: "CREATE_ENGAGEMENT";
      title: string;
      engagementType?: string;
    }
  | {
      type: "UPDATE_DEAL_STAGE";
      targetStageName: string;
    };

type TriggerContext = {
  tenantId: string;
  trigger: WorkflowTrigger;
  subjectType: string;
  subjectId: string;
  // Free-form payload available to actions (e.g., leadId on a deal trigger)
  payload?: Record<string, unknown>;
};

/**
 * Fire a workflow trigger. Runs all active rules matching this trigger.
 * Safe to call from any server action — failures are logged, not thrown.
 */
export async function fireWorkflow(ctx: TriggerContext): Promise<void> {
  try {
    const rules = await db.workflowRule.findMany({
      where: {
        tenantId: ctx.tenantId,
        trigger: ctx.trigger,
        isActive: true,
      },
    });

    for (const rule of rules) {
      let status: "SUCCEEDED" | "FAILED" | "SKIPPED" = "SUCCEEDED";
      let message: string | null = null;
      try {
        const cfg = rule.actionConfig as unknown as ActionConfig;
        await executeAction(ctx, cfg);
        message = `Ran ${cfg.type}`;
      } catch (err) {
        status = "FAILED";
        message = err instanceof Error ? err.message : "Unknown error";
      }
      await db.workflowRun.create({
        data: {
          tenantId: ctx.tenantId,
          ruleId: rule.id,
          trigger: ctx.trigger,
          subjectType: ctx.subjectType,
          subjectId: ctx.subjectId,
          status,
          message,
        },
      });
      await db.workflowRule.update({
        where: { id: rule.id },
        data: {
          runCount: { increment: 1 },
          lastRunAt: new Date(),
        },
      });
    }
  } catch (err) {
    // Swallow — workflow failures must never block the user action that triggered them.
    console.error("[workflow-runner] fire failed:", err);
  }
}

async function executeAction(ctx: TriggerContext, cfg: ActionConfig): Promise<void> {
  switch (cfg.type) {
    case "CREATE_TASK": {
      const due = cfg.dueInDays
        ? new Date(Date.now() + cfg.dueInDays * 24 * 60 * 60 * 1000)
        : null;
      // Tasks need an engagement in our schema — find the most recent active engagement
      // for the tenant as a fallback bucket, or skip if none exists.
      const engagement = await db.engagement.findFirst({
        where: { tenantId: ctx.tenantId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });
      if (!engagement) {
        throw new Error("No active engagement to attach task to");
      }
      await db.task.create({
        data: {
          tenantId: ctx.tenantId,
          engagementId: engagement.id,
          title: cfg.title,
          priority: cfg.priority ?? "MED",
          status: "TODO",
          dueDate: due,
          assigneeUserId: cfg.assigneeUserId ?? null,
        },
      });
      return;
    }
    case "LOG_ACTIVITY": {
      // Attach to lead or deal if subject is one
      const leadId =
        ctx.subjectType === "lead" ? ctx.subjectId : null;
      const dealId =
        ctx.subjectType === "deal" ? ctx.subjectId : null;
      if (!leadId && !dealId) {
        throw new Error("LOG_ACTIVITY requires lead or deal subject");
      }
      await db.crmActivity.create({
        data: {
          tenantId: ctx.tenantId,
          leadId,
          dealId,
          type: cfg.activityType ?? "NOTE",
          subject: cfg.subject,
          body: cfg.body ?? null,
        },
      });
      return;
    }
    case "SEND_INTERNAL_NOTE": {
      // For now: write to AuditLog as a tenant-wide note
      await db.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: null,
          action: "workflow.note",
          entityType: ctx.subjectType,
          entityId: ctx.subjectId,
          metadata: { note: cfg.note, trigger: ctx.trigger },
        },
      });
      return;
    }
    case "CREATE_ENGAGEMENT": {
      // Requires an entity — skip if subject isn't a customer/entity
      throw new Error("CREATE_ENGAGEMENT requires entity context — coming soon");
    }
    case "UPDATE_DEAL_STAGE": {
      if (ctx.subjectType !== "deal") {
        throw new Error("UPDATE_DEAL_STAGE only fires on deal subjects");
      }
      const stage = await db.dealStage.findFirst({
        where: { tenantId: ctx.tenantId, name: cfg.targetStageName },
      });
      if (!stage) throw new Error(`Stage "${cfg.targetStageName}" not found`);
      await db.deal.update({
        where: { id: ctx.subjectId },
        data: {
          stageId: stage.id,
          status: stage.isWon ? "WON" : stage.isLost ? "LOST" : "OPEN",
        },
      });
      return;
    }
    default: {
      // Exhaustiveness
      const _exhaustive: never = cfg;
      throw new Error(`Unknown action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  INVOICE_CREATED: "Invoice created",
  INVOICE_SENT: "Invoice sent",
  INVOICE_PAID: "Invoice paid",
  INVOICE_OVERDUE: "Invoice overdue",
  BILL_CREATED: "Bill created",
  BILL_PAID: "Bill paid",
  BILL_OVERDUE: "Bill overdue",
  LEAD_CREATED: "Lead created",
  LEAD_STATUS_CHANGED: "Lead status changed",
  DEAL_CREATED: "Deal created",
  DEAL_STAGE_CHANGED: "Deal stage changed",
  DEAL_WON: "Deal won",
  DEAL_LOST: "Deal lost",
  TASK_COMPLETED: "Task completed",
  ENGAGEMENT_LETTER_SIGNED: "Engagement letter signed",
  PORTAL_DOCUMENT_UPLOADED: "Client uploaded document",
  CUSTOMER_CREATED: "Customer created",
};

export const ACTION_LABELS: Record<string, string> = {
  CREATE_TASK: "Create a task",
  LOG_ACTIVITY: "Log a CRM activity",
  SEND_INTERNAL_NOTE: "Send an internal note (audit log)",
  CREATE_ENGAGEMENT: "Create an engagement",
  UPDATE_DEAL_STAGE: "Update deal stage",
};
