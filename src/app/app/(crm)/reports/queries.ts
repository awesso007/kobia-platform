/*
 * Report query helpers (server-only). Three built-in reports (Pipeline Funnel,
 * Deal Velocity, Activity Leaderboard) plus a generic runner that interprets a
 * saved/custom ReportDefinition against the tenant database. All reads go
 * through getTenantDb().
 *
 * The custom runner loads rows for the chosen entity (applying simple filters),
 * then either returns the selected columns as-is or, when a groupBy is set,
 * aggregates per group. Keeping aggregation in app code (not SQL) keeps the
 * runner schema-agnostic across the five entities for this v1.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { ENTITY_FIELDS } from "@/lib/crm/entity-fields";
import type { AutomationEntityKind } from "@/lib/automations/types";
import type {
  ReportDefinition,
  ReportFilter,
  ReportResult,
  ReportResultRow,
} from "@/lib/reports/types";

type Db = ReturnType<typeof getTenantDb>["db"];

// ---------------------------------------------------------------------------
// Built-in reports
// ---------------------------------------------------------------------------

export type FunnelRow = { stage: string; count: number; valueCents: number };

/** Pipeline Funnel: deal count + total value per stage of the default pipeline. */
export async function pipelineFunnel(): Promise<FunnelRow[]> {
  const { db } = getTenantDb();
  const pipeline = await db.pipeline.findFirst({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  if (!pipeline) return [];
  const stages = await db.dealStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { sortOrder: "asc" } });
  const deals = await db.deal.findMany({ where: { pipelineId: pipeline.id }, select: { stageId: true, amountCents: true } });

  return stages.map((s) => {
    const inStage = deals.filter((d) => d.stageId === s.id);
    return {
      stage: s.name,
      count: inStage.length,
      valueCents: inStage.reduce((sum, d) => sum + Number(d.amountCents), 0),
    };
  });
}

export type VelocityRow = { stage: string; avgDays: number; deals: number };

/** Deal Velocity: average days a deal has spent since last update, per stage. */
export async function dealVelocity(): Promise<VelocityRow[]> {
  const { db } = getTenantDb();
  const pipeline = await db.pipeline.findFirst({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  if (!pipeline) return [];
  const stages = await db.dealStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { sortOrder: "asc" } });
  const deals = await db.deal.findMany({ where: { pipelineId: pipeline.id }, select: { stageId: true, createdAt: true, updatedAt: true } });

  return stages.map((s) => {
    const inStage = deals.filter((d) => d.stageId === s.id);
    const totalDays = inStage.reduce((sum, d) => sum + Math.max(0, (d.updatedAt.getTime() - d.createdAt.getTime()) / 86_400_000), 0);
    return {
      stage: s.name,
      deals: inStage.length,
      avgDays: inStage.length ? Math.round((totalDays / inStage.length) * 10) / 10 : 0,
    };
  });
}

export type LeaderboardRow = { owner: string; total: number; completed: number };

/** Activity Leaderboard: activities logged + completed, grouped by owner. */
export async function activityLeaderboard(): Promise<LeaderboardRow[]> {
  const { db } = getTenantDb();
  const activities = await db.crmActivity.findMany({ select: { ownerClerkUserId: true, completedAt: true } });
  const byOwner = new Map<string, { total: number; completed: number }>();
  for (const a of activities) {
    const owner = a.ownerClerkUserId ?? "Unassigned";
    const entry = byOwner.get(owner) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (a.completedAt) entry.completed += 1;
    byOwner.set(owner, entry);
  }
  return Array.from(byOwner.entries())
    .map(([owner, v]) => ({ owner, total: v.total, completed: v.completed }))
    .sort((a, b) => b.total - a.total);
}

export type QuotePerfRow = { status: string; count: number; valueCents: number };

/** Quote Performance: quote count + total value per status (Sprint 10). */
export async function quotePerformance(): Promise<QuotePerfRow[]> {
  const { db } = getTenantDb();
  const STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"];
  const quotes = await db.quote.findMany({ select: { status: true, totalCents: true } });
  return STATUSES.map((status) => {
    const inStatus = quotes.filter((q) => q.status === status);
    return {
      status,
      count: inStatus.length,
      valueCents: inStatus.reduce((sum, q) => sum + q.totalCents, 0),
    };
  });
}

export type ProductPerfRow = { product: string; quantity: number; revenueCents: number };

/**
 * Product Performance: units and revenue per product across all deal line items
 * (Sprint 10). Revenue uses the stored lineTotalCents (generated column).
 */
export async function productPerformance(): Promise<ProductPerfRow[]> {
  const { db } = getTenantDb();
  const lines = await db.dealLineItem.findMany({
    select: { name: true, productId: true, quantity: true, lineTotalCents: true },
  });
  const byProduct = new Map<string, { product: string; quantity: number; revenueCents: number }>();
  for (const l of lines) {
    const key = l.productId ?? `custom:${l.name}`;
    const entry = byProduct.get(key) ?? { product: l.name, quantity: 0, revenueCents: 0 };
    entry.quantity += Number(l.quantity);
    entry.revenueCents += l.lineTotalCents;
    byProduct.set(key, entry);
  }
  return Array.from(byProduct.values())
    .map((e) => ({ ...e, quantity: Math.round(e.quantity * 100) / 100 }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Custom report runner
// ---------------------------------------------------------------------------

function fieldLabel(entity: AutomationEntityKind, key: string): string {
  return ENTITY_FIELDS[entity].find((f) => f.key === key)?.label ?? key;
}

async function loadEntityRows(db: Db, entity: AutomationEntityKind): Promise<Record<string, unknown>[]> {
  switch (entity) {
    case "LEAD":
      return (await db.lead.findMany({ take: 5000 })) as Record<string, unknown>[];
    case "DEAL": {
      const rows = await db.deal.findMany({ take: 5000 });
      return rows.map((d) => ({ ...d, amountCents: Number(d.amountCents) })) as Record<string, unknown>[];
    }
    case "CONTACT":
      return (await db.contact.findMany({ take: 5000 })) as Record<string, unknown>[];
    case "COMPANY":
      return (await db.company.findMany({ take: 5000 })) as Record<string, unknown>[];
    case "ACTIVITY":
      return (await db.crmActivity.findMany({ take: 5000 })) as Record<string, unknown>[];
    default:
      return [];
  }
}

function matchesFilter(row: Record<string, unknown>, f: ReportFilter): boolean {
  const raw = row[f.field];
  const val = f.value ?? "";
  switch (f.operator) {
    case "is_set":
      return raw !== null && raw !== undefined && raw !== "";
    case "is_empty":
      return raw === null || raw === undefined || raw === "";
    case "eq":
      return String(raw ?? "") === val;
    case "neq":
      return String(raw ?? "") !== val;
    case "contains":
      return String(raw ?? "").toLowerCase().includes(val.toLowerCase());
    case "gt":
      return Number(raw) > Number(val);
    case "lt":
      return Number(raw) < Number(val);
    default:
      return true;
  }
}

function aggregate(values: number[], agg: string): number {
  if (values.length === 0) return 0;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return values.length;
  }
}

/** Run a custom report definition and return tabular + chart-ready data. */
export async function runReport(def: ReportDefinition): Promise<ReportResult> {
  const { db } = getTenantDb();
  const all = await loadEntityRows(db, def.entity);
  const rows = all.filter((r) => def.filters.every((f) => matchesFilter(r, f)));

  if (def.groupBy) {
    const groupBy = def.groupBy;
    const agg = def.aggregation ?? "count";
    const aggField = def.aggregateField;
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      const key = String(r[groupBy] ?? "(none)");
      const list = groups.get(key) ?? [];
      if (agg !== "count" && aggField) list.push(Number(r[aggField] ?? 0));
      else list.push(0);
      groups.set(key, list);
    }
    const resultRows: ReportResultRow[] = Array.from(groups.entries()).map(([group, vals]) => ({
      group,
      value: aggregate(vals, agg),
    }));
    resultRows.sort((a, b) => Number(b.value) - Number(a.value));
    return {
      columns: [
        { key: "group", label: fieldLabel(def.entity, groupBy) },
        { key: "value", label: agg === "count" ? "Count" : `${agg} of ${aggField ? fieldLabel(def.entity, aggField) : ""}` },
      ],
      rows: resultRows,
      chart: def.chart ?? "bar",
      groupBy,
    };
  }

  const columns = def.columns.length > 0 ? def.columns : ENTITY_FIELDS[def.entity].slice(0, 5).map((f) => f.key);
  const resultRows: ReportResultRow[] = rows.slice(0, 1000).map((r) => {
    const out: ReportResultRow = {};
    for (const c of columns) {
      const v = r[c];
      out[c] = v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : (v as string | number);
    }
    return out;
  });

  return {
    columns: columns.map((c) => ({ key: c, label: fieldLabel(def.entity, c) })),
    rows: resultRows,
    chart: def.chart ?? "none",
    groupBy: null,
  };
}

export type SavedReportRow = {
  id: string;
  name: string;
  definition: ReportDefinition;
  createdAt: string;
};

export async function listSavedReports(): Promise<SavedReportRow[]> {
  const { db } = getTenantDb();
  const rows = await db.savedReport.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    definition: r.definition as ReportDefinition,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getSavedReport(id: string): Promise<SavedReportRow | null> {
  const { db } = getTenantDb();
  const r = await db.savedReport.findUnique({ where: { id } });
  if (!r) return null;
  return { id: r.id, name: r.name, definition: r.definition as ReportDefinition, createdAt: r.createdAt.toISOString() };
}
