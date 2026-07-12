/*
 * filters.ts (Sprint 23) - pure evaluation of a stored EmailFilter against a
 * message. Server-only usage lives in mutations.runFilter; this module stays
 * dependency-free so it is easy to unit test and reuse.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { EmailFolder } from "@/lib/db/generated/tenant";

export type FilterField = "from" | "subject" | "body";
export type FilterOp = "contains" | "equals" | "regex";

export type FilterCondition = {
  field: FilterField;
  op: FilterOp;
  value: string;
};

export type FilterActionType = "APPLY_LABEL" | "MOVE" | "MARK_READ" | "STAR";

export type FilterAction = {
  type: FilterActionType;
  /** labelId for APPLY_LABEL, folder for MOVE; unused for MARK_READ / STAR. */
  value?: string;
};

export type FilterMessageView = {
  fromAddress: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
};

/** The concrete mutation an action resolves to for one message. */
export type ResolvedFilterAction =
  | { kind: "APPLY_LABEL"; labelId: string }
  | { kind: "MOVE"; folder: EmailFolder }
  | { kind: "MARK_READ" }
  | { kind: "STAR" };

const FOLDERS: EmailFolder[] = ["INBOX", "SENT", "DRAFTS", "ARCHIVE", "SPAM", "TRASH"];

function fieldValue(msg: FilterMessageView, field: FilterField): string {
  switch (field) {
    case "from":
      return msg.fromAddress ?? "";
    case "subject":
      return msg.subject ?? "";
    case "body":
      return (msg.bodyText ?? (msg.bodyHtml ?? "").replace(/<[^>]+>/g, " ")) ?? "";
    default:
      return "";
  }
}

export function matchesCondition(condition: FilterCondition, msg: FilterMessageView): boolean {
  const haystack = fieldValue(msg, condition.field);
  const needle = condition.value ?? "";
  if (!needle) return false;
  switch (condition.op) {
    case "contains":
      return haystack.toLowerCase().includes(needle.toLowerCase());
    case "equals":
      return haystack.trim().toLowerCase() === needle.trim().toLowerCase();
    case "regex":
      try {
        return new RegExp(needle, "i").test(haystack);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Evaluate a filter against a message. Returns the resolved action(s) to apply,
 * or [] when the condition does not match.
 */
export function applyFilterToMessage(
  filter: { enabled?: boolean; condition: FilterCondition; action: FilterAction },
  msg: FilterMessageView,
): ResolvedFilterAction[] {
  if (filter.enabled === false) return [];
  if (!matchesCondition(filter.condition, msg)) return [];

  const a = filter.action;
  switch (a.type) {
    case "APPLY_LABEL":
      return a.value ? [{ kind: "APPLY_LABEL", labelId: a.value }] : [];
    case "MOVE":
      return a.value && FOLDERS.includes(a.value as EmailFolder)
        ? [{ kind: "MOVE", folder: a.value as EmailFolder }]
        : [];
    case "MARK_READ":
      return [{ kind: "MARK_READ" }];
    case "STAR":
      return [{ kind: "STAR" }];
    default:
      return [];
  }
}
