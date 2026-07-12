/*
 * Client-safe automation types, constants, and the pure condition evaluator.
 * Kept free of any server-only import (no getTenantDb / next/headers) so the
 * builder UI and the server dispatcher can both import it.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export const AUTOMATION_ENTITIES = ["LEAD", "DEAL", "CONTACT", "COMPANY", "ACTIVITY", "TASK", "PROJECT", "EVENT", "BOOKING", "TICKET", "CHAT_MESSAGE", "SITE_PAGE", "FORM_V2", "STOCK_ITEM", "STOCK_TRANSFER", "PURCHASE_ORDER", "FEED_POST", "FEED_COMMENT", "WORKGROUP"] as const;
export type AutomationEntityKind = (typeof AUTOMATION_ENTITIES)[number];

export const AUTOMATION_TRIGGERS = [
  "RECORD_CREATED",
  "RECORD_UPDATED",
  "FIELD_CHANGED",
  "STAGE_CHANGED",
  "ACTIVITY_DUE",
  "SCHEDULE",
  "EMAIL_SENT",
  "EMAIL_RECEIVED",
  "SMS_RECEIVED",
  "CALL_COMPLETED",
  "FILE_UPLOADED",
  "STAGE_TIME_EXCEEDED",
  "DEAL_AMOUNT_CHANGED",
  "QUOTE_SENT",
  "QUOTE_ACCEPTED",
  "LINE_ITEM_ADDED",
  "TASK_CREATED",
  "TASK_STATUS_CHANGED",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "PROJECT_STATUS_CHANGED",
  "EVENT_CREATED",
  "EVENT_STARTING_SOON",
  "BOOKING_CONFIRMED",
  "TICKET_CREATED",
  "TICKET_STATUS_CHANGED",
  "SLA_BREACHED",
  "KB_ARTICLE_VIEWED",
  "CHAT_MENTION",
  "SITE_FORM_SUBMIT",
  "SITE_PAGE_PUBLISHED",
  "FORM_V2_SUBMIT",
  "FORM_V2_PAID",
  "STOCK_LOW",
  "TRANSFER_RECEIVED",
  "PURCHASE_ORDER_RECEIVED",
  "FEED_POST_CREATED",
  "FEED_COMMENT_CREATED",
  "FEED_MENTION",
  "FEED_ANNOUNCEMENT_PINNED",
  "WORKGROUP_CREATED",
  "WORKGROUP_MEMBER_JOINED",
  "WORKGROUP_JOIN_REQUESTED",
  "WORKGROUP_INVITE_SENT",
] as const;
export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<AutomationTriggerKind, string> = {
  RECORD_CREATED: "Record created",
  RECORD_UPDATED: "Record updated",
  FIELD_CHANGED: "Field changed",
  STAGE_CHANGED: "Deal stage changed",
  ACTIVITY_DUE: "Activity due",
  SCHEDULE: "On a schedule",
  EMAIL_SENT: "Email sent",
  EMAIL_RECEIVED: "Email received",
  SMS_RECEIVED: "SMS received",
  CALL_COMPLETED: "Call completed",
  FILE_UPLOADED: "File uploaded",
  STAGE_TIME_EXCEEDED: "Deal rotting in stage",
  DEAL_AMOUNT_CHANGED: "Deal amount changed",
  QUOTE_SENT: "Quote sent",
  QUOTE_ACCEPTED: "Quote accepted",
  LINE_ITEM_ADDED: "Line item added",
  TASK_CREATED: "Task created",
  TASK_STATUS_CHANGED: "Task status changed",
  TASK_DUE_SOON: "Task due soon",
  TASK_OVERDUE: "Task overdue",
  PROJECT_STATUS_CHANGED: "Project status changed",
  EVENT_CREATED: "Event created",
  EVENT_STARTING_SOON: "Event starting soon",
  BOOKING_CONFIRMED: "Booking confirmed",
  TICKET_CREATED: "Ticket created",
  TICKET_STATUS_CHANGED: "Ticket status changed",
  SLA_BREACHED: "SLA breached",
  KB_ARTICLE_VIEWED: "KB article viewed",
  CHAT_MENTION: "Chat mention",
  SITE_FORM_SUBMIT: "Site form submitted",
  SITE_PAGE_PUBLISHED: "Site page published",
  FORM_V2_SUBMIT: "Form 2.0 submitted",
  FORM_V2_PAID: "Form 2.0 payment received",
  STOCK_LOW: "Stock low",
  TRANSFER_RECEIVED: "Stock transfer received",
  PURCHASE_ORDER_RECEIVED: "Purchase order received",
  FEED_POST_CREATED: "Feed post created",
  FEED_COMMENT_CREATED: "Feed comment created",
  FEED_MENTION: "Feed mention",
  FEED_ANNOUNCEMENT_PINNED: "Feed announcement pinned",
  WORKGROUP_CREATED: "Workgroup created",
  WORKGROUP_MEMBER_JOINED: "Workgroup member joined",
  WORKGROUP_JOIN_REQUESTED: "Workgroup join requested",
  WORKGROUP_INVITE_SENT: "Workgroup invite sent",
};

export const CONDITION_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "gt",
  "lt",
  "in",
  "is_set",
  "is_empty",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "equals",
  neq: "not equals",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  in: "in list",
  is_set: "is set",
  is_empty: "is empty",
};

export const ACTION_KINDS = [
  "CREATE_ACTIVITY",
  "UPDATE_FIELD",
  "CREATE_RECORD",
  "ADD_TAG",
  "REMOVE_TAG",
  "ASSIGN_OWNER",
  "SEND_EMAIL",
  "SEND_SMS",
  "MAKE_CALL",
  "ATTACH_FILE",
  "WAIT",
  "CREATE_QUOTE",
  "SEND_QUOTE",
  "CREATE_TASK",
  "ASSIGN_TASK",
  "UPDATE_TASK_STATUS",
  "ADD_TASK_TO_PROJECT",
  "CREATE_EVENT",
  "ATTACH_EVENT_TO_RECORD",
  "SEND_BOOKING_LINK",
  "SEND_BROADCAST",
  "ENROLL_IN_CAMPAIGN",
  "ADD_TO_SEGMENT",
  "SEND_FOR_SIGNATURE",
  "CREATE_TICKET",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_LABELS: Record<ActionKind, string> = {
  CREATE_ACTIVITY: "Create activity",
  UPDATE_FIELD: "Update field",
  CREATE_RECORD: "Create record",
  ADD_TAG: "Add tag",
  REMOVE_TAG: "Remove tag",
  ASSIGN_OWNER: "Assign owner",
  SEND_EMAIL: "Send email",
  SEND_SMS: "Send SMS",
  MAKE_CALL: "Make call",
  ATTACH_FILE: "Attach file",
  WAIT: "Wait",
  CREATE_QUOTE: "Create quote",
  SEND_QUOTE: "Send quote",
  CREATE_TASK: "Create task",
  ASSIGN_TASK: "Assign task",
  UPDATE_TASK_STATUS: "Update task status",
  ADD_TASK_TO_PROJECT: "Add task to project",
  CREATE_EVENT: "Create calendar event",
  ATTACH_EVENT_TO_RECORD: "Attach event to record",
  SEND_BOOKING_LINK: "Send booking link",
  SEND_BROADCAST: "Send broadcast",
  ENROLL_IN_CAMPAIGN: "Enroll in campaign",
  ADD_TO_SEGMENT: "Add to segment",
  SEND_FOR_SIGNATURE: "Send for signature",
  CREATE_TICKET: "Create ticket",
};

export type ConditionRow = {
  field: string;
  operator: ConditionOperator;
  value?: string;
};

export type ConditionGroup = {
  combinator: "AND" | "OR";
  rows: ConditionRow[];
};

export type AutomationAction = {
  kind: ActionKind;
  config: Record<string, unknown>;
};

export type TriggerConfig = {
  watchFields?: string[];
  field?: string;
  offsetMinutes?: number;
  cron?: string;
};

/** Event shape passed into dispatchAutomation by every CRUD action. */
export type AutomationEvent = {
  type: AutomationTriggerKind;
  entityType: AutomationEntityKind;
  entityId: string;
  changedFields?: string[];
  record?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function evalRow(row: ConditionRow, record: Record<string, unknown>): boolean {
  const actual = record[row.field];
  const expected = row.value ?? "";
  switch (row.operator) {
    case "eq":
      return String(actual ?? "") === expected;
    case "neq":
      return String(actual ?? "") !== expected;
    case "contains":
      return String(actual ?? "").toLowerCase().includes(expected.toLowerCase());
    case "gt": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      return a !== null && b !== null && a > b;
    }
    case "lt": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      return a !== null && b !== null && a < b;
    }
    case "in":
      return expected
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .includes(String(actual ?? ""));
    case "is_set":
      return actual !== null && actual !== undefined && actual !== "";
    case "is_empty":
      return actual === null || actual === undefined || actual === "";
    default:
      return false;
  }
}

/** Evaluate a single condition group against a flat record map. Empty = pass. */
export function evaluateConditions(
  group: ConditionGroup | null | undefined,
  record: Record<string, unknown>,
): boolean {
  if (!group || group.rows.length === 0) return true;
  const results = group.rows.map((r) => evalRow(r, record));
  return group.combinator === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/** Resolve {{record.field}} placeholders in a template against the record map. */
export function renderTemplate(template: string, record: Record<string, unknown>): string {
  return template.replace(/\{\{\s*record\.([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = record[key];
    return v === null || v === undefined ? "" : String(v);
  });
}
