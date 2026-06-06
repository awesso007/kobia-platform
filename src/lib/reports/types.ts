/*
 * Client-safe report definition types shared by the reports list, the built-in
 * report views, and the custom report builder. A SavedReport.definition column
 * stores a ReportDefinition as JSON. The custom report runner in
 * reports/queries.ts interprets these against the tenant database.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { AutomationEntityKind } from "@/lib/automations/types";

export const REPORT_ENTITIES: AutomationEntityKind[] = ["LEAD", "DEAL", "CONTACT", "COMPANY", "ACTIVITY"];

export const REPORT_OPERATORS = ["eq", "neq", "contains", "gt", "lt", "is_set", "is_empty"] as const;
export type ReportOperator = (typeof REPORT_OPERATORS)[number];

export const REPORT_OPERATOR_LABELS: Record<ReportOperator, string> = {
  eq: "equals",
  neq: "not equals",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  is_set: "is set",
  is_empty: "is empty",
};

export const AGGREGATIONS = ["count", "sum", "avg", "min", "max"] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const CHART_TYPES = ["none", "bar", "line", "pie"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export type ReportFilter = {
  field: string;
  operator: ReportOperator;
  value?: string;
};

export type ReportDefinition = {
  entity: AutomationEntityKind;
  columns: string[];
  filters: ReportFilter[];
  groupBy?: string | null;
  aggregation?: Aggregation;
  aggregateField?: string | null;
  chart?: ChartType;
};

export const EMPTY_DEFINITION: ReportDefinition = {
  entity: "DEAL",
  columns: [],
  filters: [],
  groupBy: null,
  aggregation: "count",
  aggregateField: null,
  chart: "bar",
};

export type ReportResultRow = Record<string, string | number | null>;

export type ReportResult = {
  columns: { key: string; label: string }[];
  rows: ReportResultRow[];
  chart: ChartType;
  groupBy: string | null;
};
