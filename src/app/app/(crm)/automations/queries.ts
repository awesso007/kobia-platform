/*
 * Automations query helpers (server-only). Reads through getTenantDb(). Lists
 * automations (excluding soft-deleted) and recent runs per automation.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type {
  AutomationAction,
  AutomationEntityKind,
  AutomationTriggerKind,
  ConditionGroup,
  TriggerConfig,
} from "@/lib/automations/types";

export type AutomationRow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: AutomationTriggerKind;
  triggerConfig: TriggerConfig | null;
  entityType: AutomationEntityKind;
  conditions: ConditionGroup | null;
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
  runCount: number;
};

export type AutomationRunRow = {
  id: string;
  status: string;
  entityType: string;
  entityId: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  actionsExecuted: unknown;
};

export async function listAutomations(): Promise<AutomationRow[]> {
  const { db } = getTenantDb();
  const rows = await db.automation.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { runs: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    enabled: a.enabled,
    triggerType: a.triggerType as AutomationTriggerKind,
    triggerConfig: (a.triggerConfig ?? null) as TriggerConfig | null,
    entityType: a.entityType as AutomationEntityKind,
    conditions: (a.conditions ?? null) as ConditionGroup | null,
    actions: (a.actions ?? []) as AutomationAction[],
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    runCount: a._count.runs,
  }));
}

export async function getAutomation(id: string): Promise<AutomationRow | null> {
  const { db } = getTenantDb();
  const a = await db.automation.findUnique({ where: { id }, include: { _count: { select: { runs: true } } } });
  if (!a || a.deletedAt) return null;
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    enabled: a.enabled,
    triggerType: a.triggerType as AutomationTriggerKind,
    triggerConfig: (a.triggerConfig ?? null) as TriggerConfig | null,
    entityType: a.entityType as AutomationEntityKind,
    conditions: (a.conditions ?? null) as ConditionGroup | null,
    actions: (a.actions ?? []) as AutomationAction[],
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    runCount: a._count.runs,
  };
}

export async function listAutomationRuns(automationId: string, limit = 50): Promise<AutomationRunRow[]> {
  const { db } = getTenantDb();
  const runs = await db.automationRun.findMany({
    where: { automationId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return runs.map((r) => ({
    id: r.id,
    status: r.status,
    entityType: r.entityType,
    entityId: r.entityId,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    error: r.error,
    actionsExecuted: r.actionsExecuted,
  }));
}
