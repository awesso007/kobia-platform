"use client";

/*
 * Public Forms 2.0 renderer (Sprint 19). A multi-step wizard that evaluates
 * visibility rules and calculations live, posts to /api/f2/[slug]/submit?t=, and
 * settles payment (if a PAYMENT field is present) through the stub
 * /api/f2/[slug]/payment-intent?t= endpoint. Step navigation and successful
 * submits are reported to /api/f2/[slug]/track?t= best-effort.
 *
 * All pure logic lives in form-utils (no "use client") so it is shared with the
 * server validator. This file exports components only.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState } from "react";
import {
  evaluateVisibility,
  evaluateCalculation,
  normalizeOptions,
  formatMoneyCents,
  isPresentationField,
  type PublicField,
  type PublicStep,
  type PublicForm,
} from "@/lib/forms2/form-utils";

type Values = Record<string, unknown>;

function track(slug: string, tenant: string, event: string, extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({ event, path: typeof window !== "undefined" ? window.location.pathname : null, ...extra });
  fetch(`/api/f2/${encodeURIComponent(slug)}/track?t=${encodeURIComponent(tenant)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function PublicFormUI({
  tenantSlug,
  formSlug,
  form,
  steps,
  fields,
}: {
  tenantSlug: string;
  formSlug: string;
  form: PublicForm;
  steps: PublicStep[];
  fields: PublicField[];
}) {
  const [values, setValues] = useState<Values>(() => {
    const initial: Values = {};
    for (const f of fields) {
      if (f.defaultValue !== null && f.defaultValue !== undefined) initial[f.key] = f.defaultValue;
    }
    return initial;
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Group fields per step; fields with no stepId fall into the first step.
  const orderedSteps: PublicStep[] = steps.length > 0 ? steps : [{ id: "__single", order: 0, title: "", description: null }];
  const fieldsForStep = useMemo(() => {
    const firstStepId = orderedSteps[0]!.id;
    const byStep = new Map<string, PublicField[]>();
    for (const s of orderedSteps) byStep.set(s.id, []);
    for (const f of fields) {
      const sid = f.stepId && byStep.has(f.stepId) ? f.stepId : firstStepId;
      byStep.get(sid)!.push(f);
    }
    return byStep;
  }, [orderedSteps, fields]);

  const currentStep = orderedSteps[stepIndex]!;
  const currentFields = (fieldsForStep.get(currentStep.id) ?? []).filter((f) => evaluateVisibility(f.visibilityRule, values));

  const paymentField = fields.find((f) => f.type === "PAYMENT" && (f.paymentAmount ?? 0) > 0) ?? null;

  function setValue(key: string, v: unknown) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateVisibleStep(): boolean {
    const next: Record<string, string> = {};
    for (const f of currentFields) {
      if (isPresentationField(f.type) || f.type === "CALCULATED" || f.type === "PAYMENT") continue;
      if (f.required) {
        const v = values[f.key];
        const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
        if (empty) next[f.key] = `${f.label} is required.`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateVisibleStep()) return;
    const nextIndex = Math.min(stepIndex + 1, orderedSteps.length - 1);
    setStepIndex(nextIndex);
    track(formSlug, tenantSlug, "STEP_ADVANCE", { stepId: orderedSteps[nextIndex]!.id });
  }

  function goBack() {
    const prevIndex = Math.max(stepIndex - 1, 0);
    setStepIndex(prevIndex);
    track(formSlug, tenantSlug, "STEP_BACK", { stepId: orderedSteps[prevIndex]!.id });
  }

  async function settlePayment(submissionId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/f2/${encodeURIComponent(formSlug)}/payment-intent?t=${encodeURIComponent(tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const json = (await res.json()) as { ok: boolean; paid?: boolean };
      return !!(res.ok && json.ok && json.paid);
    } catch {
      return false;
    }
  }

  async function onSubmit() {
    if (!validateVisibleStep()) return;
    setFormError(null);
    setSubmitting(true);
    track(formSlug, tenantSlug, "SUBMIT_ATTEMPT");
    try {
      const res = await fetch(`/api/f2/${encodeURIComponent(formSlug)}/submit?t=${encodeURIComponent(tenantSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        errors?: Record<string, string>;
        submissionId?: string;
        requiresPayment?: boolean;
      };
      if (!res.ok || !json.ok) {
        if (json.errors) setErrors(json.errors);
        setFormError(json.error ?? "Please fix the highlighted fields.");
        setSubmitting(false);
        return;
      }
      if (json.requiresPayment && json.submissionId) {
        const paid = await settlePayment(json.submissionId);
        if (!paid) {
          setFormError("Payment could not be completed. Please try again.");
          setSubmitting(false);
          return;
        }
      }
      if (form.redirectUrl) {
        window.location.href = form.redirectUrl;
        return;
      }
      setDone(true);
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-sm" style={{ color: "var(--kb-text-primary)" }}>
        <p>{form.successMessage || "Thank you. Your submission has been received."}</p>
      </div>
    );
  }

  const isLastStep = stepIndex >= orderedSteps.length - 1;

  return (
    <div className="space-y-4">
      {orderedSteps.length > 1 && (
        <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          Step {stepIndex + 1} of {orderedSteps.length}
          {currentStep.title ? ` - ${currentStep.title}` : ""}
        </div>
      )}
      {currentStep.description && (
        <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {currentStep.description}
        </p>
      )}

      <div className="space-y-3">
        {currentFields.map((f) => (
          <FieldRenderer
            key={f.id}
            field={f}
            values={values}
            error={errors[f.key]}
            onChange={(v) => setValue(f.key, v)}
          />
        ))}
      </div>

      {formError && (
        <div className="text-sm" style={{ color: "var(--kb-error)" }}>
          {formError}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        {stepIndex > 0 ? (
          <button type="button" onClick={goBack} className="rounded px-4 py-2 text-sm" style={secondaryBtnStyle}>
            Back
          </button>
        ) : (
          <span />
        )}
        {isLastStep ? (
          <button type="button" onClick={onSubmit} disabled={submitting} className="rounded px-4 py-2 text-sm text-white" style={{ ...primaryBtnStyle, opacity: submitting ? 0.7 : 1 }}>
            {submitting
              ? "Submitting..."
              : paymentField
                ? `Pay ${formatMoneyCents(paymentField.paymentAmount, paymentField.paymentCurrency)}`
                : form.submitButtonLabel || "Submit"}
          </button>
        ) : (
          <button type="button" onClick={goNext} className="rounded px-4 py-2 text-sm text-white" style={primaryBtnStyle}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function FieldRenderer({
  field,
  values,
  error,
  onChange,
}: {
  field: PublicField;
  values: Values;
  error: string | undefined;
  onChange: (v: unknown) => void;
}) {
  const f = field;

  if (f.type === "HEADING") {
    return (
      <h2 style={{ fontSize: "var(--kb-fs-h2)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{f.label}</h2>
    );
  }
  if (f.type === "PARAGRAPH") {
    return (
      <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        {f.label}
      </p>
    );
  }
  if (f.type === "HIDDEN") {
    return null;
  }

  const label = (
    <label className="mb-1 block text-sm" style={{ color: "var(--kb-text-secondary)" }}>
      {f.label}
      {f.required ? " *" : ""}
    </label>
  );
  const help = f.helpText ? (
    <p className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
      {f.helpText}
    </p>
  ) : null;
  const errNode = error ? (
    <p className="mt-1 text-xs" style={{ color: "var(--kb-error)" }}>
      {error}
    </p>
  ) : null;

  const raw = values[f.key];
  const strVal = raw === undefined || raw === null ? "" : String(raw);
  const options = normalizeOptions(f.options);

  let control: React.ReactNode = null;

  switch (f.type) {
    case "LONG_TEXT":
      control = (
        <textarea rows={4} value={strVal} placeholder={f.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
      );
      break;
    case "SELECT":
    case "RADIO":
      if (f.type === "RADIO") {
        control = (
          <div className="space-y-1">
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
                <input type="radio" name={f.key} value={o.value} checked={strVal === o.value} onChange={() => onChange(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        );
      } else {
        control = (
          <select value={strVal} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle}>
            <option value="">Select...</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }
      break;
    case "MULTISELECT":
    case "CHECKBOX": {
      const arr = Array.isArray(raw) ? (raw as unknown[]).map(String) : [];
      control = (
        <div className="space-y-1">
          {options.map((o) => {
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
                <input
                  type="checkbox"
                  value={o.value}
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(arr);
                    if (e.target.checked) next.add(o.value);
                    else next.delete(o.value);
                    onChange(Array.from(next));
                  }}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      );
      break;
    }
    case "NUMBER":
      control = (
        <input type="number" value={strVal} placeholder={f.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
      );
      break;
    case "DATE":
      control = <input type="date" value={strVal} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />;
      break;
    case "DATETIME":
      control = <input type="datetime-local" value={strVal} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />;
      break;
    case "EMAIL":
      control = (
        <input type="email" value={strVal} placeholder={f.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
      );
      break;
    case "PHONE":
      control = (
        <input type="tel" value={strVal} placeholder={f.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
      );
      break;
    case "FILE":
      control = <input type="file" onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")} className="w-full text-sm" style={{ color: "var(--kb-text-primary)" }} />;
      break;
    case "RATING": {
      const max = 5;
      const current = Number(raw ?? 0);
      control = (
        <div className="flex gap-1">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="rounded px-2 py-1 text-sm"
              style={{
                border: "1px solid var(--kb-border)",
                borderRadius: "var(--kb-radius-sm)",
                backgroundColor: current >= n ? "var(--kb-primary)" : "var(--kb-surface)",
                color: current >= n ? "#fff" : "var(--kb-text-primary)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      );
      break;
    }
    case "SIGNATURE":
      control = (
        <input type="text" value={strVal} placeholder="Type your full name to sign" onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={{ ...inputStyle, fontStyle: "italic" }} />
      );
      break;
    case "CALCULATED": {
      const n = evaluateCalculation(f.calculation, values);
      control = (
        <div className="rounded px-2 py-1.5 text-sm" style={{ ...inputStyle, backgroundColor: "var(--kb-surface-grey)" }}>
          {n === null ? "-" : n}
        </div>
      );
      break;
    }
    case "PAYMENT":
      control = (
        <div className="rounded px-3 py-2 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }}>
          {f.paymentDescription ? <div className="mb-1">{f.paymentDescription}</div> : null}
          <strong>{formatMoneyCents(f.paymentAmount, f.paymentCurrency)}</strong>
        </div>
      );
      break;
    default:
      control = (
        <input type="text" value={strVal} placeholder={f.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
      );
  }

  return (
    <div>
      {label}
      {control}
      {help}
      {errNode}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--kb-surface)",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  color: "var(--kb-text-primary)",
};

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: "var(--kb-primary)",
  borderRadius: "var(--kb-radius-sm)",
};

const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: "var(--kb-surface)",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  color: "var(--kb-text-primary)",
};
