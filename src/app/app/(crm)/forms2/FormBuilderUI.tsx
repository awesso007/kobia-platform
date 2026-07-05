"use client";

/*
 * Forms 2.0 builder (Sprint 19). Three-pane layout: left = step list + add
 * step; center = fields for the selected step with arrow-button reorder and
 * click-to-select; right = settings for the selected field. Top bar has
 * Preview, Save (form-level settings), and Publish. No new packages: reordering
 * uses arrow buttons, not a drag library.
 *
 * Each mutation calls the authenticated /api/forms2 endpoints and then
 * router.refresh() so the server component re-supplies the canonical state.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FIELD_TYPE_DEFS,
  fieldTypeHasOptions,
  normalizeOptions,
  VISIBILITY_OPERATORS,
  VISIBILITY_OPERATOR_LABELS,
  isVisibilityRule,
  type FieldType,
  type OptionItem,
} from "@/lib/forms2/form-utils";

export type BuilderStep = { id: string; order: number; title: string; description: string | null };
export type BuilderField = {
  id: string;
  stepId: string | null;
  order: number;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  options: unknown;
  validation: unknown;
  defaultValue: string | null;
  calculation: string | null;
  paymentAmount: number | null;
  paymentCurrency: string;
  paymentDescription: string | null;
  visibilityRule: unknown;
};
export type BuilderForm = {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  successMessage: string | null;
  redirectUrl: string | null;
  submitButtonLabel: string;
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--kb-border)",
  backgroundColor: "var(--kb-bg)",
  borderRadius: "var(--kb-radius-sm)",
};

export function FormBuilder({
  form,
  steps,
  fields,
}: {
  form: BuilderForm;
  steps: BuilderStep[];
  fields: BuilderField[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedStepId, setSelectedStepId] = useState<string | null>(steps[0]?.id ?? null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function api(path: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    const res = await fetch(`/api/forms2/${form.id}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg((await res.text()) || "Request failed");
      return null;
    }
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  const activeStepId = selectedStepId ?? steps[0]?.id ?? null;
  const stepFields = fields
    .filter((f) => (f.stepId ?? steps[0]?.id ?? null) === activeStepId)
    .sort((a, b) => a.order - b.order);
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  async function addStep() {
    const r = await api("/steps", "POST", { title: `Step ${steps.length + 1}` });
    if (r?.id) setSelectedStepId(String(r.id));
    refresh();
  }
  async function updateStep(stepId: string, patch: Partial<BuilderStep>) {
    await api(`/steps/${stepId}`, "PATCH", patch);
    refresh();
  }
  async function deleteStep(stepId: string) {
    if (!confirm("Delete this step? Fields on it are kept but unassigned.")) return;
    await api(`/steps/${stepId}`, "DELETE");
    if (selectedStepId === stepId) setSelectedStepId(null);
    refresh();
  }
  async function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const ordered = [...steps];
    const [s] = ordered.splice(index, 1);
    ordered.splice(target, 0, s!);
    await api("/steps/reorder", "PATCH", { orderedIds: ordered.map((x) => x.id) });
    refresh();
  }

  async function addField(type: FieldType) {
    const def = FIELD_TYPE_DEFS.find((d) => d.type === type)!;
    const r = await api("/fields", "POST", {
      type,
      label: def.label,
      stepId: activeStepId,
      options: def.hasOptions ? [{ label: "Option 1", value: "option_1" }] : undefined,
      paymentAmount: type === "PAYMENT" ? 0 : undefined,
    });
    if (r?.id) setSelectedFieldId(String(r.id));
    refresh();
  }
  async function updateField(fieldId: string, patch: Record<string, unknown>) {
    await api(`/fields/${fieldId}`, "PATCH", patch);
    refresh();
  }
  async function deleteField(fieldId: string) {
    if (!confirm("Delete this field?")) return;
    await api(`/fields/${fieldId}`, "DELETE");
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
    refresh();
  }
  async function moveField(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= stepFields.length) return;
    const ordered = [...stepFields];
    const [f] = ordered.splice(index, 1);
    ordered.splice(target, 0, f!);
    await api("/fields/reorder", "PATCH", { orderedIds: ordered.map((x) => x.id) });
    refresh();
  }

  async function publish() {
    const next = form.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    await api("/publish", "POST", { status: next });
    refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar form={form} isPending={isPending} onPublish={publish} onSaved={() => refresh()} api={api} />
      {msg ? (
        <div className="px-4 py-1 text-xs" style={{ color: "#dc2626" }}>
          {msg}
        </div>
      ) : null}
      <div className="flex flex-1 gap-3 p-4" style={{ minHeight: "60vh" }}>
        <StepPane
          steps={steps}
          activeStepId={activeStepId}
          onSelect={setSelectedStepId}
          onAdd={addStep}
          onRename={(id, title) => updateStep(id, { title })}
          onDelete={deleteStep}
          onMove={moveStep}
        />
        <FieldListPane
          fields={stepFields}
          selectedFieldId={selectedFieldId}
          onSelect={setSelectedFieldId}
          onAdd={addField}
          onDelete={deleteField}
          onMove={moveField}
        />
        <SettingsPane field={selectedField} allFields={fields} onUpdate={updateField} />
      </div>
    </div>
  );
}

function TopBar({
  form,
  isPending,
  onPublish,
  onSaved,
  api,
}: {
  form: BuilderForm;
  isPending: boolean;
  onPublish: () => void;
  onSaved: () => void;
  api: (path: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(form.name);
  const [description, setDescription] = useState(form.description ?? "");
  const [successMessage, setSuccessMessage] = useState(form.successMessage ?? "");
  const [redirectUrl, setRedirectUrl] = useState(form.redirectUrl ?? "");
  const [submitButtonLabel, setSubmitButtonLabel] = useState(form.submitButtonLabel);

  async function save() {
    await api("", "PATCH", {
      name,
      description: description || null,
      successMessage: successMessage || null,
      redirectUrl: redirectUrl || null,
      submitButtonLabel: submitButtonLabel || "Submit",
    });
    setOpen(false);
    onSaved();
  }

  return (
    <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--kb-border)" }}>
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {form.name}
        </div>
        <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          /f2/{form.slug} - {form.status}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`/f2/${form.slug}?t=preview`}
          target="_blank"
          rel="noreferrer"
          className="rounded px-3 py-1.5 text-sm"
          style={{ border: "1px solid var(--kb-border)" }}
        >
          Preview
        </a>
        <button onClick={() => setOpen((v) => !v)} className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
          Settings
        </button>
        <button
          onClick={onPublish}
          disabled={isPending}
          className="rounded px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          {form.status === "PUBLISHED" ? "Unpublish" : "Publish"}
        </button>
      </div>
      {open ? (
        <div
          className="absolute right-4 z-10 mt-2 w-80 space-y-2 rounded p-4 shadow-lg"
          style={{ top: "120px", backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}
        >
          <LabeledInput label="Name" value={name} onChange={setName} />
          <LabeledTextarea label="Description" value={description} onChange={setDescription} />
          <LabeledTextarea label="Success message" value={successMessage} onChange={setSuccessMessage} />
          <LabeledInput label="Redirect URL" value={redirectUrl} onChange={setRedirectUrl} />
          <LabeledInput label="Submit button label" value={submitButtonLabel} onChange={setSubmitButtonLabel} />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="rounded px-3 py-1 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
              Cancel
            </button>
            <button onClick={save} className="rounded px-3 py-1 text-sm text-white" style={{ backgroundColor: "var(--kb-primary)" }}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepPane({
  steps,
  activeStepId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onMove,
}: {
  steps: BuilderStep[];
  activeStepId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="w-56 shrink-0 rounded" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <div className="border-b px-3 py-2 text-xs font-medium uppercase" style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}>
        Steps
      </div>
      <div className="space-y-1 p-2">
        {steps.map((s, i) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="cursor-pointer rounded px-2 py-1.5 text-sm"
            style={{
              backgroundColor: activeStepId === s.id ? "var(--kb-primary)1a" : "transparent",
              color: "var(--kb-text-primary)",
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate">{s.title || `Step ${i + 1}`}</span>
              <span className="flex gap-0.5">
                <MiniBtn label="up" onClick={(e) => { e.stopPropagation(); onMove(i, -1); }} disabled={i === 0} />
                <MiniBtn label="dn" onClick={(e) => { e.stopPropagation(); onMove(i, 1); }} disabled={i === steps.length - 1} />
                <MiniBtn label="x" onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} />
              </span>
            </div>
            {activeStepId === s.id ? (
              <input
                value={s.title}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onRename(s.id, e.target.value)}
                className="mt-1 w-full px-1 py-0.5 text-xs"
                style={inputStyle}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="p-2">
        <button onClick={onAdd} className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px dashed var(--kb-border)" }}>
          + Add step
        </button>
      </div>
    </div>
  );
}

function FieldListPane({
  fields,
  selectedFieldId,
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: {
  fields: BuilderField[];
  selectedFieldId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: FieldType) => void;
  onDelete: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="flex-1 rounded" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <div className="border-b px-3 py-2 text-xs font-medium uppercase" style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}>
        Fields
      </div>
      <div className="space-y-1 p-2">
        {fields.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            No fields on this step yet.
          </p>
        ) : (
          fields.map((f, i) => (
            <div
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm"
              style={{
                backgroundColor: selectedFieldId === f.id ? "var(--kb-primary)1a" : "transparent",
                border: "1px solid var(--kb-border)",
                color: "var(--kb-text-primary)",
              }}
            >
              <span className="truncate">
                {f.label} <code className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{f.type}</code>
                {f.required ? <span style={{ color: "#dc2626" }}> *</span> : null}
              </span>
              <span className="flex gap-0.5">
                <MiniBtn label="up" onClick={(e) => { e.stopPropagation(); onMove(i, -1); }} disabled={i === 0} />
                <MiniBtn label="dn" onClick={(e) => { e.stopPropagation(); onMove(i, 1); }} disabled={i === fields.length - 1} />
                <MiniBtn label="x" onClick={(e) => { e.stopPropagation(); onDelete(f.id); }} />
              </span>
            </div>
          ))
        )}
      </div>
      <div className="p-2">
        <button onClick={() => setPickerOpen((v) => !v)} className="w-full rounded px-2 py-1 text-sm" style={{ border: "1px dashed var(--kb-border)" }}>
          + Add field
        </button>
        {pickerOpen ? (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {FIELD_TYPE_DEFS.map((d) => (
              <button
                key={d.type}
                onClick={() => {
                  onAdd(d.type);
                  setPickerOpen(false);
                }}
                className="rounded px-2 py-1 text-left text-xs"
                style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)" }}
              >
                {d.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingsPane({
  field,
  allFields,
  onUpdate,
}: {
  field: BuilderField | null;
  allFields: BuilderField[];
  onUpdate: (fieldId: string, patch: Record<string, unknown>) => void;
}) {
  if (!field) {
    return (
      <div className="w-80 shrink-0 rounded p-4 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", color: "var(--kb-text-secondary)" }}>
        Select a field to edit its settings.
      </div>
    );
  }
  return <FieldSettings key={field.id} field={field} allFields={allFields} onUpdate={onUpdate} />;
}

function FieldSettings({
  field,
  allFields,
  onUpdate,
}: {
  field: BuilderField;
  allFields: BuilderField[];
  onUpdate: (fieldId: string, patch: Record<string, unknown>) => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [placeholder, setPlaceholder] = useState(field.placeholder ?? "");
  const [helpText, setHelpText] = useState(field.helpText ?? "");
  const [required, setRequired] = useState(field.required);
  const [defaultValue, setDefaultValue] = useState(field.defaultValue ?? "");
  const [calculation, setCalculation] = useState(field.calculation ?? "");
  const [paymentAmount, setPaymentAmount] = useState(field.paymentAmount ?? 0);
  const [paymentCurrency, setPaymentCurrency] = useState(field.paymentCurrency);
  const [paymentDescription, setPaymentDescription] = useState(field.paymentDescription ?? "");
  const [optionsText, setOptionsText] = useState(
    normalizeOptions(field.options).map((o: OptionItem) => (o.label === o.value ? o.value : `${o.label}|${o.value}`)).join("\n"),
  );

  const rule = isVisibilityRule(field.visibilityRule) ? field.visibilityRule : null;
  const [visField, setVisField] = useState(rule?.conditions[0]?.field ?? "");
  const [visOp, setVisOp] = useState<string>(rule?.conditions[0]?.op ?? "eq");
  const [visValue, setVisValue] = useState(rule?.conditions[0]?.value ?? "");

  const hasOptions = fieldTypeHasOptions(field.type);

  function parseOptions(): OptionItem[] {
    return optionsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [l, v] = line.split("|");
        const label = (l ?? "").trim();
        const value = (v ?? l ?? "").trim();
        return { label, value };
      });
  }

  function buildVisibility(): unknown {
    if (!visField) return null;
    return { logic: "AND", conditions: [{ field: visField, op: visOp, value: visValue }] };
  }

  function saveAll() {
    onUpdate(field.id, {
      label,
      placeholder: placeholder || null,
      helpText: helpText || null,
      required,
      defaultValue: defaultValue || null,
      calculation: field.type === "CALCULATED" ? calculation || null : undefined,
      options: hasOptions ? parseOptions() : undefined,
      paymentAmount: field.type === "PAYMENT" ? Number(paymentAmount) || 0 : undefined,
      paymentCurrency: field.type === "PAYMENT" ? paymentCurrency : undefined,
      paymentDescription: field.type === "PAYMENT" ? paymentDescription || null : undefined,
      visibilityRule: buildVisibility(),
    });
  }

  const otherFields = allFields.filter((f) => f.id !== field.id);

  return (
    <div className="w-80 shrink-0 space-y-3 overflow-y-auto rounded p-4" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <div className="text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
        {field.type} - <code>{field.key}</code>
      </div>
      <LabeledInput label="Label" value={label} onChange={setLabel} />
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required
      </label>
      <LabeledInput label="Placeholder" value={placeholder} onChange={setPlaceholder} />
      <LabeledInput label="Help text" value={helpText} onChange={setHelpText} />
      <LabeledInput label="Default value" value={defaultValue} onChange={setDefaultValue} />

      {hasOptions ? (
        <div>
          <label className="block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
            Options (one per line, label|value)
          </label>
          <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={4} className="mt-1 w-full px-2 py-1 text-sm" style={inputStyle} />
        </div>
      ) : null}

      {field.type === "CALCULATED" ? (
        <LabeledInput label="Calculation (e.g. {{qty}} * {{price}})" value={calculation} onChange={setCalculation} />
      ) : null}

      {field.type === "PAYMENT" ? (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
              Amount (cents)
            </label>
            <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} className="mt-1 w-full px-2 py-1 text-sm" style={inputStyle} />
          </div>
          <LabeledInput label="Currency" value={paymentCurrency} onChange={setPaymentCurrency} />
          <LabeledInput label="Payment description" value={paymentDescription} onChange={setPaymentDescription} />
        </div>
      ) : null}

      <div className="border-t pt-2" style={{ borderColor: "var(--kb-border)" }}>
        <div className="mb-1 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
          Visibility
        </div>
        <select value={visField} onChange={(e) => setVisField(e.target.value)} className="mb-1 w-full px-2 py-1 text-sm" style={inputStyle}>
          <option value="">Always visible</option>
          {otherFields.map((f) => (
            <option key={f.id} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </select>
        {visField ? (
          <div className="flex gap-1">
            <select value={visOp} onChange={(e) => setVisOp(e.target.value)} className="w-1/2 px-1 py-1 text-sm" style={inputStyle}>
              {VISIBILITY_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {VISIBILITY_OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
            <input value={visValue} onChange={(e) => setVisValue(e.target.value)} placeholder="value" className="w-1/2 px-1 py-1 text-sm" style={inputStyle} />
          </div>
        ) : null}
      </div>

      <button onClick={saveAll} className="w-full rounded px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>
        Save field
      </button>
    </div>
  );
}

function MiniBtn({ label, onClick, disabled }: { label: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded px-1 text-xs"
      style={{ border: "1px solid var(--kb-border)", opacity: disabled ? 0.4 : 1, color: "var(--kb-text-secondary)" }}
    >
      {label === "up" ? "↑" : label === "dn" ? "↓" : "×"}
    </button>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full px-2 py-1 text-sm" style={inputStyle} />
    </div>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="mt-1 w-full px-2 py-1 text-sm" style={inputStyle} />
    </div>
  );
}
