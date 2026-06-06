"use client";

/*
 * CustomFieldInputs - render the tenant's custom fields for an entity type as a
 * controlled form section. Used on create modals and in the RecordPane Details
 * tab. Parent owns a { fieldId: value } map; onChange reports a single field
 * change. Value shape per type: TEXT/URL/EMAIL/PHONE/SELECT -> string,
 * NUMBER -> number, BOOLEAN -> boolean, DATE -> "YYYY-MM-DD" string,
 * MULTI_SELECT -> string[].
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { CustomFieldDef, CustomFieldValueMap } from "@/lib/crm/record";

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
};

export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDef[];
  values: CustomFieldValueMap;
  onChange: (fieldId: string, value: unknown) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <label key={f.id} className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            {f.label}
            {f.required ? <span style={{ color: "var(--kb-error)" }}> *</span> : null}
          </span>
          <FieldControl field={f} value={values[f.id]} onChange={(v) => onChange(f.id, v)} />
        </label>
      ))}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "NUMBER":
      return (
        <input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
      );
    case "BOOLEAN":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
      );
    case "DATE":
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
      );
    case "SELECT":
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={inputStyle}
        >
          <option value="">Select...</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "MULTI_SELECT": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => {
            const on = arr.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])}
                className="rounded px-2 py-1 text-xs"
                style={{
                  border: "1px solid var(--kb-border)",
                  borderRadius: "var(--kb-radius-sm)",
                  backgroundColor: on ? "var(--kb-primary)" : "var(--kb-surface)",
                  color: on ? "#fff" : "var(--kb-text-secondary)",
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <input
          type={field.type === "EMAIL" ? "email" : field.type === "URL" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />
      );
  }
}
