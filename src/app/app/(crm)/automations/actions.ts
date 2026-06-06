"use server";

/*
 * Automation config server actions. All DB access goes through getTenantDb().
 * These mutate automation definitions (tenant settings, not CRM record data),
 * so they do not write CRM audit entries; automation EXECUTION is recorded in
 * AutomationRun by the dispatcher instead. Soft delete sets deletedAt.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import {
  AUTOMATION_ENTITIES,
  AUTOMATION_TRIGGERS,
  type AutomationAction,
  type AutomationEntityKind,
  type AutomationTriggerKind,
  type ConditionGroup,
  type TriggerConfig,
} from "@/lib/automations/types";

function asEntity(v: unknown): AutomationEntityKind {
  return AUTOMATION_ENTITIES.includes(v as AutomationEntityKind) ? (v as AutomationEntityKind) : "LEAD";
}
function asTrigger(v: unknown): AutomationTriggerKind {
  return AUTOMATION_TRIGGERS.includes(v as AutomationTriggerKind) ? (v as AutomationTriggerKind) : "RECORD_CREATED";
}

export type AutomationInput = {
  name: string;
  description?: string;
  enabled?: boolean;
  triggerType: string;
  triggerConfig?: TriggerConfig | null;
  entityType: string;
  conditions?: ConditionGroup | null;
  actions: AutomationAction[];
};

function dataFrom(input: AutomationInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    enabled: input.enabled ?? true,
    triggerType: asTrigger(input.triggerType) as never,
    triggerConfig: (input.triggerConfig ?? undefined) as never,
    entityType: asEntity(input.entityType) as never,
    conditions: (input.conditions ?? undefined) as never,
    actions: (input.actions ?? []) as never,
  };
}

export async function createAutomation(input: AutomationInput) {
  const name = input.name?.trim();
  if (!name) throw new Error("Automation name is required.");
  const { db } = getTenantDb();
  const a = await db.automation.create({ data: dataFrom(input) });
  revalidatePath("/app/automations");
  return a.id;
}

export async function updateAutomation(id: string, input: AutomationInput) {
  const name = input.name?.trim();
  if (!name) throw new Error("Automation name is required.");
  const { db } = getTenantDb();
  await db.automation.update({ where: { id }, data: dataFrom(input) });
  revalidatePath("/app/automations");
  revalidatePath(`/app/automations/${id}`);
}

export async function toggleAutomation(id: string, enabled: boolean) {
  const { db } = getTenantDb();
  await db.automation.update({ where: { id }, data: { enabled } });
  revalidatePath("/app/automations");
}

export async function deleteAutomation(id: string) {
  const { db } = getTenantDb();
  await db.automation.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
  revalidatePath("/app/automations");
}

/** Load recent runs for an automation (used by the run-history panel). */
export async function loadAutomationRuns(automationId: string) {
  const { listAutomationRuns } = await import("./queries");
  return listAutomationRuns(automationId);
}
