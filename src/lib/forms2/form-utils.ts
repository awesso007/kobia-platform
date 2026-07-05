/*
 * Forms 2.0 pure helpers (Sprint 19). No "use client" and no server-only imports
 * so both the public form renderer (client) and the server (submit/validation)
 * can share this logic: the field-type catalog, conditional visibility rules,
 * and a safe calculation-expression evaluator (tokenizer + shunting-yard, no
 * eval).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export const FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
  "NUMBER",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTISELECT",
  "RADIO",
  "CHECKBOX",
  "FILE",
  "RATING",
  "SIGNATURE",
  "HIDDEN",
  "CALCULATED",
  "PAYMENT",
  "HEADING",
  "PARAGRAPH",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldGroup = "Basic" | "Choice" | "Advanced" | "Layout";

export type FieldTypeDef = {
  type: FieldType;
  label: string;
  group: FieldGroup;
  hasOptions: boolean;
};

export const FIELD_TYPE_DEFS: FieldTypeDef[] = [
  { type: "SHORT_TEXT", label: "Short text", group: "Basic", hasOptions: false },
  { type: "LONG_TEXT", label: "Long text", group: "Basic", hasOptions: false },
  { type: "EMAIL", label: "Email", group: "Basic", hasOptions: false },
  { type: "PHONE", label: "Phone", group: "Basic", hasOptions: false },
  { type: "NUMBER", label: "Number", group: "Basic", hasOptions: false },
  { type: "DATE", label: "Date", group: "Basic", hasOptions: false },
  { type: "DATETIME", label: "Date and time", group: "Basic", hasOptions: false },
  { type: "SELECT", label: "Dropdown", group: "Choice", hasOptions: true },
  { type: "MULTISELECT", label: "Multi-select", group: "Choice", hasOptions: true },
  { type: "RADIO", label: "Radio group", group: "Choice", hasOptions: true },
  { type: "CHECKBOX", label: "Checkboxes", group: "Choice", hasOptions: true },
  { type: "FILE", label: "File upload", group: "Advanced", hasOptions: false },
  { type: "RATING", label: "Rating", group: "Advanced", hasOptions: false },
  { type: "SIGNATURE", label: "Signature", group: "Advanced", hasOptions: false },
  { type: "HIDDEN", label: "Hidden", group: "Advanced", hasOptions: false },
  { type: "CALCULATED", label: "Calculated", group: "Advanced", hasOptions: false },
  { type: "PAYMENT", label: "Payment", group: "Advanced", hasOptions: false },
  { type: "HEADING", label: "Heading", group: "Layout", hasOptions: false },
  { type: "PARAGRAPH", label: "Paragraph", group: "Layout", hasOptions: false },
];

export function fieldTypeDef(type: string): FieldTypeDef | undefined {
  return FIELD_TYPE_DEFS.find((d) => d.type === type);
}

export function fieldTypeHasOptions(type: string): boolean {
  return fieldTypeDef(type)?.hasOptions ?? false;
}

/** Layout-only fields collect no answer (headings, paragraphs). */
export function isPresentationField(type: string): boolean {
  return type === "HEADING" || type === "PARAGRAPH";
}

export const VISIBILITY_OPERATORS = ["eq", "neq", "gt", "lt", "contains", "empty", "not_empty"] as const;
export type VisibilityOperator = (typeof VISIBILITY_OPERATORS)[number];

export const VISIBILITY_OPERATOR_LABELS: Record<VisibilityOperator, string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  lt: "less than",
  contains: "contains",
  empty: "is empty",
  not_empty: "is not empty",
};

export type VisibilityCondition = { field: string; op: VisibilityOperator; value?: string };
export type VisibilityRule = { logic: "AND" | "OR"; conditions: VisibilityCondition[] };

export function isVisibilityRule(v: unknown): v is VisibilityRule {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (r.logic === "AND" || r.logic === "OR") && Array.isArray(r.conditions);
}

function toComparableNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function evaluateCondition(cond: VisibilityCondition, values: Record<string, unknown>): boolean {
  const actual = values[cond.field];
  const expected = cond.value ?? "";
  switch (cond.op) {
    case "eq":
      return String(actual ?? "") === String(expected);
    case "neq":
      return String(actual ?? "") !== String(expected);
    case "gt": {
      const a = toComparableNumber(actual);
      const b = toComparableNumber(expected);
      return a !== null && b !== null && a > b;
    }
    case "lt": {
      const a = toComparableNumber(actual);
      const b = toComparableNumber(expected);
      return a !== null && b !== null && a < b;
    }
    case "contains":
      if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
      return String(actual ?? "").toLowerCase().includes(String(expected).toLowerCase());
    case "empty":
      return isEmptyValue(actual);
    case "not_empty":
      return !isEmptyValue(actual);
    default:
      return true;
  }
}

/**
 * Evaluate a field's visibility rule against the current answers. A field with
 * no rule is always visible. AND requires every condition; OR requires any.
 */
export function evaluateVisibility(rule: unknown, values: Record<string, unknown>): boolean {
  if (!isVisibilityRule(rule)) return true;
  if (rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => evaluateCondition(c, values));
  return rule.logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

// ---- Calculation expressions -------------------------------------------------
// Grammar: numeric literals, + - * /, parentheses, and field references that are
// either {{field_key}} or a bare identifier. No function calls, no eval. Field
// values that are not numeric resolve to 0.

type Token =
  | { kind: "num"; value: number }
  | { kind: "ref"; key: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenizeCalculation(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === "{" && expr[i + 1] === "{") {
      const end = expr.indexOf("}}", i + 2);
      if (end === -1) return null;
      const key = expr.slice(i + 2, end).trim();
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return null;
      tokens.push({ kind: "ref", key });
      i = end + 2;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < expr.length && /[0-9.]/.test(expr[j]!)) j++;
      const num = Number(expr.slice(i, j));
      if (Number.isNaN(num)) return null;
      tokens.push({ kind: "num", value: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j]!)) j++;
      tokens.push({ kind: "ref", key: expr.slice(i, j) });
      i = j;
      continue;
    }
    return null;
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function toRpn(tokens: Token[]): Token[] | null {
  const output: Token[] = [];
  const ops: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "num" || t.kind === "ref") {
      output.push(t);
    } else if (t.kind === "op") {
      while (
        ops.length > 0 &&
        ops[ops.length - 1]!.kind === "op" &&
        PRECEDENCE[(ops[ops.length - 1] as { value: string }).value]! >= PRECEDENCE[t.value]!
      ) {
        output.push(ops.pop()!);
      }
      ops.push(t);
    } else if (t.kind === "lparen") {
      ops.push(t);
    } else if (t.kind === "rparen") {
      let found = false;
      while (ops.length > 0) {
        const top = ops.pop()!;
        if (top.kind === "lparen") {
          found = true;
          break;
        }
        output.push(top);
      }
      if (!found) return null;
    }
  }
  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.kind === "lparen" || top.kind === "rparen") return null;
    output.push(top);
  }
  return output;
}

function refValue(key: string, values: Record<string, unknown>): number {
  const raw = values[key];
  const n = toComparableNumber(raw);
  return n ?? 0;
}

/**
 * Safely evaluate a calculation expression against the answer map. Returns null
 * when the expression is malformed or divides by zero, so callers can fall back
 * gracefully rather than crash a public form.
 */
export function evaluateCalculation(expr: unknown, values: Record<string, unknown>): number | null {
  if (typeof expr !== "string" || expr.trim() === "") return null;
  const tokens = tokenizeCalculation(expr);
  if (!tokens || tokens.length === 0) return null;
  const rpn = toRpn(tokens);
  if (!rpn) return null;
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.kind === "num") {
      stack.push(t.value);
    } else if (t.kind === "ref") {
      stack.push(refValue(t.key, values));
    } else if (t.kind === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      let r: number;
      switch (t.value) {
        case "+":
          r = a + b;
          break;
        case "-":
          r = a - b;
          break;
        case "*":
          r = a * b;
          break;
        case "/":
          if (b === 0) return null;
          r = a / b;
          break;
      }
      stack.push(r);
    }
  }
  if (stack.length !== 1) return null;
  const result = stack[0]!;
  return Number.isFinite(result) ? result : null;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Derive a safe field key from a label: lower snake_case, ascii only. */
export function fieldKeyFromLabel(label: string): string {
  const key = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return key || "field";
}

export function formatMoneyCents(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export type OptionItem = { label: string; value: string };

/** Normalize a field's options json into a clean {label,value}[] list. */
export function normalizeOptions(options: unknown): OptionItem[] {
  if (!Array.isArray(options)) return [];
  const out: OptionItem[] = [];
  for (const o of options) {
    if (typeof o === "string") {
      out.push({ label: o, value: o });
    } else if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      const label = String(rec.label ?? rec.value ?? "");
      const value = String(rec.value ?? rec.label ?? "");
      if (label || value) out.push({ label: label || value, value: value || label });
    }
  }
  return out;
}
