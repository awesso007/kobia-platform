"use server";

/*
 * Reports server actions. SavedReport stores a report builder definition as
 * JSON; these CRUD that definition through getTenantDb(). Like the automation
 * config actions, these mutate tenant settings (not CRM record data) so they do
 * not write CRM audit entries.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { REPORT_ENTITIES, type ReportDefinition } from "@/lib/reports/types";
import type { AutomationEntityKind } from "@/lib/automations/types";

function sanitize(def: ReportDefinition): ReportDefinition {
  const entity: AutomationEntityKind = REPORT_ENTITIES.includes(def.entity) ? def.entity : "DEAL";
  return {
    entity,
    columns: Array.isArray(def.columns) ? def.columns : [],
    filters: Array.isArray(def.filters) ? def.filters : [],
    groupBy: def.groupBy ?? null,
    aggregation: def.aggregation ?? "count",
    aggregateField: def.aggregateField ?? null,
    chart: def.chart ?? "none",
  };
}

export async function saveReport(input: { name: string; definition: ReportDefinition }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Report name is required.");
  const { db } = getTenantDb();
  const r = await db.savedReport.create({
    data: { name, definition: sanitize(input.definition) as never },
  });
  revalidatePath("/app/reports");
  return r.id;
}

export async function updateReport(id: string, input: { name: string; definition: ReportDefinition }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Report name is required.");
  const { db } = getTenantDb();
  await db.savedReport.update({
    where: { id },
    data: { name, definition: sanitize(input.definition) as never },
  });
  revalidatePath("/app/reports");
  revalidatePath(`/app/reports/builder`);
}

export async function deleteReport(id: string) {
  const { db } = getTenantDb();
  await db.savedReport.delete({ where: { id } });
  revalidatePath("/app/reports");
}

/** Run a definition on demand from the builder client (live preview). */
export async function previewReport(definition: ReportDefinition) {
  const { runReport } = await import("./queries");
  return runReport(sanitize(definition));
}
