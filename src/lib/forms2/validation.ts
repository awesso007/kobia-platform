/*
 * Forms 2.0 server-side validation (Sprint 19). Validates a submitted answer map
 * against a form's fields. Only visible fields are validated (a field hidden by
 * its visibility rule cannot be required), and layout/presentation fields never
 * carry an answer. Mirrors the client-side checks so a crafted POST cannot slip
 * past the browser.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { evaluateVisibility, isPresentationField, normalizeOptions } from "./form-utils";

export type ValidatableField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
  validation: unknown;
  visibilityRule: unknown;
};

export type FieldValidation = {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

export type ValidationResult = { ok: true } | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asValidation(v: unknown): FieldValidation {
  return v && typeof v === "object" ? (v as FieldValidation) : {};
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function validateOne(field: ValidatableField, value: unknown): string | null {
  const rules = asValidation(field.validation);

  if (field.required && isEmpty(value)) return `${field.label} is required.`;
  if (isEmpty(value)) return null; // optional + empty: nothing more to check

  switch (field.type) {
    case "EMAIL":
      if (typeof value !== "string" || !EMAIL_RE.test(value)) return `${field.label} must be a valid email.`;
      break;
    case "NUMBER":
    case "RATING":
    case "CALCULATED": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) return `${field.label} must be a number.`;
      if (rules.min !== undefined && n < rules.min) return `${field.label} must be at least ${rules.min}.`;
      if (rules.max !== undefined && n > rules.max) return `${field.label} must be at most ${rules.max}.`;
      break;
    }
    case "SELECT":
    case "RADIO": {
      const allowed = normalizeOptions(field.options).map((o) => o.value);
      if (allowed.length > 0 && !allowed.includes(String(value))) return `${field.label} has an invalid choice.`;
      break;
    }
    case "MULTISELECT":
    case "CHECKBOX": {
      const allowed = new Set(normalizeOptions(field.options).map((o) => o.value));
      const arr = Array.isArray(value) ? value : [value];
      if (allowed.size > 0 && arr.some((v) => !allowed.has(String(v)))) return `${field.label} has an invalid choice.`;
      break;
    }
    default:
      break;
  }

  if (typeof value === "string") {
    if (rules.minLength !== undefined && value.length < rules.minLength)
      return `${field.label} must be at least ${rules.minLength} characters.`;
    if (rules.maxLength !== undefined && value.length > rules.maxLength)
      return `${field.label} must be at most ${rules.maxLength} characters.`;
    if (rules.pattern) {
      try {
        if (!new RegExp(rules.pattern).test(value)) return `${field.label} is not in the expected format.`;
      } catch {
        // An invalid pattern in the form config should not block submission.
      }
    }
  }

  return null;
}

/**
 * Validate the whole submission. Fields hidden by their visibility rule (given
 * the submitted values) are skipped entirely.
 */
export function validateSubmission(
  fields: ValidatableField[],
  values: Record<string, unknown>,
): ValidationResult {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (isPresentationField(field.type)) continue;
    if (!evaluateVisibility(field.visibilityRule, values)) continue;
    const err = validateOne(field, values[field.key]);
    if (err) errors[field.key] = err;
  }
  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}
